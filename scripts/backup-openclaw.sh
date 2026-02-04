#!/bin/zsh
# OpenClaw & Mission Control Backup Script
# Created for Sherif's backup strategy
# Usage: ./backup-openclaw.sh [daily|weekly|manual]

set -e

BACKUP_TYPE="${1:-manual}"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
HOSTNAME=$(hostname -s)
BACKUP_BASE_DIR="$HOME/OpenClaw-Backups"
BACKUP_DIR="$BACKUP_BASE_DIR/${BACKUP_TYPE}_${TIMESTAMP}"
RETENTION_DAYS=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "${BLUE}🔄 OpenClaw Backup Script - $BACKUP_TYPE Backup${NC}"
echo "${BLUE}📅 Timestamp: $TIMESTAMP${NC}"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to backup with progress
backup_item() {
    local src="$1"
    local dest="$2"
    local name="$3"
    
    if [ -e "$src" ]; then
        echo "${YELLOW}📦 Backing up: $name${NC}"
        if [ -d "$src" ]; then
            # Directory backup
            cp -r "$src" "$dest" 2>/dev/null || {
                echo "${RED}⚠️  Warning: Could not backup directory $name${NC}"
                return 1
            }
            local size=$(du -sh "$dest" | cut -f1)
            echo "${GREEN}✅ $name backed up (${size})${NC}"
        else
            # File backup
            cp "$src" "$dest" 2>/dev/null || {
                echo "${RED}⚠️  Warning: Could not backup file $name${NC}"
                return 1
            }
            echo "${GREEN}✅ $name backed up${NC}"
        fi
    else
        echo "${YELLOW}⚠️  Skipped (not found): $name${NC}"
    fi
}

# 1. BACKUP OPENCLAW WORKSPACE
echo "${BLUE}━━━ Backing up OpenClaw Workspace ━━━${NC}"
mkdir -p "$BACKUP_DIR/openclaw-workspace"

# Core identity and config files
backup_item "$HOME/.openclaw/workspace/SOUL.md" "$BACKUP_DIR/openclaw-workspace/SOUL.md" "SOUL.md"
backup_item "$HOME/.openclaw/workspace/USER.md" "$BACKUP_DIR/openclaw-workspace/USER.md" "USER.md"
backup_item "$HOME/.openclaw/workspace/AGENTS.md" "$BACKUP_DIR/openclaw-workspace/AGENTS.md" "AGENTS.md"
backup_item "$HOME/.openclaw/workspace/IDENTITY.md" "$BACKUP_DIR/openclaw-workspace/IDENTITY.md" "IDENTITY.md"
backup_item "$HOME/.openclaw/workspace/TOOLS.md" "$BACKUP_DIR/openclaw-workspace/TOOLS.md" "TOOLS.md"
backup_item "$HOME/.openclaw/workspace/MEMORY.md" "$BACKUP_DIR/openclaw-workspace/MEMORY.md" "MEMORY.md"
backup_item "$HOME/.openclaw/workspace/HEARTBEAT.md" "$BACKUP_DIR/openclaw-workspace/HEARTBEAT.md" "HEARTBEAT.md"

# Memory directory
backup_item "$HOME/.openclaw/workspace/memory" "$BACKUP_DIR/openclaw-workspace/memory" "memory/ (daily notes)"

# Agent configurations
backup_item "$HOME/.openclaw/workspace/agents" "$BACKUP_DIR/openclaw-workspace/agents" "agents/ (all agent configs)"

echo ""

# 2. BACKUP MISSION CONTROL
echo "${BLUE}━━━ Backing up Mission Control ━━━${NC}"
mkdir -p "$BACKUP_DIR/mission-control"

# Database (CRITICAL)
echo "${YELLOW}💾 Backing up Mission Control database...${NC}"
if [ -f "$HOME/Projects/mission-control/mission-control.db" ]; then
    cp "$HOME/Projects/mission-control/mission-control.db" "$BACKUP_DIR/mission-control/"
    local db_size=$(du -sh "$BACKUP_DIR/mission-control/mission-control.db" | cut -f1)
    echo "${GREEN}✅ mission-control.db backed up (${db_size})${NC}"
else
    echo "${RED}❌ Database not found!${NC}"
fi

# Schema and migrations
backup_item "$HOME/Projects/mission-control/src/lib/db/schema.ts" "$BACKUP_DIR/mission-control/schema.ts" "Database schema"
backup_item "$HOME/Projects/mission-control/src/lib/db/migrations" "$BACKUP_DIR/mission-control/migrations" "Database migrations"
backup_item "$HOME/Projects/mission-control/src/lib/db/seed-prompts.sql" "$BACKUP_DIR/mission-control/seed-prompts.sql" "Seed prompts SQL"

# Environment files
backup_item "$HOME/Projects/mission-control/.env.local" "$BACKUP_DIR/mission-control/.env.local" "Environment config"
backup_item "$HOME/Projects/mission-control/.env" "$BACKUP_DIR/mission-control/.env" "Environment variables"

echo ""

# 3. BACKUP SCRIPTS & ALIASES
echo "${BLUE}━━━ Backing up Scripts & Aliases ━━━${NC}"
mkdir -p "$BACKUP_DIR/scripts"

backup_item "$HOME/start-mission-control.sh" "$BACKUP_DIR/scripts/start-mission-control.sh" "Mission Control startup script"
backup_item "$HOME/.zshrc" "$BACKUP_DIR/scripts/.zshrc" "Zsh configuration (aliases)"
backup_item "$HOME/.bashrc" "$BACKUP_DIR/scripts/.bashrc" "Bash configuration" 2>/dev/null || true

# Export aliases to separate file
grep -E "(mc=|openclaw|mission)" "$HOME/.zshrc" > "$BACKUP_DIR/scripts/aliases.sh" 2>/dev/null || true
echo "${GREEN}✅ Aliases exported${NC}"

echo ""

# 4. BACKUP GIT REPOSITORIES
echo "${BLUE}━━━ Backing up Git Repositories ━━━${NC}"
mkdir -p "$BACKUP_DIR/repos"

# Mission Control repo structure (excluding node_modules)
echo "${YELLOW}📁 Backing up Mission Control repository...${NC}"
if [ -d "$HOME/Projects/mission-control" ]; then
    # Create a clean archive excluding node_modules
    tar -czf "$BACKUP_DIR/repos/mission-control-repo.tar.gz" \
        --exclude="node_modules" \
        --exclude=".next" \
        --exclude="dist" \
        --exclude="*.log" \
        -C "$HOME/Projects" mission-control 2>/dev/null || {
        echo "${RED}⚠️  Warning: Could not archive Mission Control repo${NC}"
    }
    
    if [ -f "$BACKUP_DIR/repos/mission-control-repo.tar.gz" ]; then
        local repo_size=$(du -sh "$BACKUP_DIR/repos/mission-control-repo.tar.gz" | cut -f1)
        echo "${GREEN}✅ Mission Control repo archived (${repo_size})${NC}"
    fi
else
    echo "${YELLOW}⚠️  Mission Control directory not found${NC}"
fi

echo ""

# 5. CREATE RESTORATION SCRIPT
echo "${BLUE}━━━ Creating Restoration Script ━━━${NC}"
cat > "$BACKUP_DIR/RESTORE.sh" << 'EOF'
#!/bin/zsh
# OpenClaw Restoration Script
# This script restores OpenClaw configuration from backup

set -e

BACKUP_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🔄 OpenClaw Restoration from $BACKUP_DIR"
echo ""
echo "⚠️  WARNING: This will OVERWRITE existing configurations!"
read "confirm?Are you sure you want to restore? (yes/no): "

if [[ $confirm != "yes" ]]; then
    echo "❌ Restoration cancelled"
    exit 1
fi

echo ""
echo "━━━ Restoring OpenClaw Workspace ━━━"

# Restore workspace files
if [ -d "$BACKUP_DIR/openclaw-workspace" ]; then
    mkdir -p "$HOME/.openclaw/workspace"
    cp -r "$BACKUP_DIR/openclaw-workspace/"* "$HOME/.openclaw/workspace/" 2>/dev/null || true
    echo "✅ OpenClaw workspace restored"
fi

echo ""
echo "━━━ Restoring Mission Control ━━━"

# Restore database
if [ -f "$BACKUP_DIR/mission-control/mission-control.db" ]; then
    mkdir -p "$HOME/Projects/mission-control"
    cp "$BACKUP_DIR/mission-control/mission-control.db" "$HOME/Projects/mission-control/"
    echo "✅ Mission Control database restored"
    
    # Restore other Mission Control files
    if [ -f "$BACKUP_DIR/mission-control/.env.local" ]; then
        cp "$BACKUP_DIR/mission-control/.env.local" "$HOME/Projects/mission-control/"
    fi
fi

echo ""
echo "━━━ Restoring Scripts ━━━"

if [ -f "$BACKUP_DIR/scripts/start-mission-control.sh" ]; then
    cp "$BACKUP_DIR/scripts/start-mission-control.sh" "$HOME/"
    chmod +x "$HOME/start-mission-control.sh"
    echo "✅ Startup script restored"
fi

if [ -f "$BACKUP_DIR/scripts/.zshrc" ]; then
    cp "$BACKUP_DIR/scripts/.zshrc" "$HOME/.zshrc.backup.$(date +%s)"
    echo "✅ Zsh config backed up to .zshrc.backup.*"
    # Don't auto-overwrite .zshrc - let user merge manually
    echo "⚠️  Review .zshrc and merge aliases manually or run:"
    echo "   cat $BACKUP_DIR/scripts/aliases.sh >> ~/.zshrc"
fi

echo ""
echo "━━━ Restoring Repository ━━━"

if [ -f "$BACKUP_DIR/repos/mission-control-repo.tar.gz" ]; then
    echo "📦 Repository archive found. To restore:"
    echo "   cd ~/Projects"
    echo "   rm -rf mission-control"
    echo "   tar -xzf $BACKUP_DIR/repos/mission-control-repo.tar.gz"
fi

echo ""
echo "✅ Restoration complete!"
echo ""
echo "Next steps:"
echo "1. Review restored files"
echo "2. Run: mc (to start Mission Control)"
echo "3. Verify everything works"
EOF

chmod +x "$BACKUP_DIR/RESTORE.sh"
echo "${GREEN}✅ Restoration script created${NC}"

echo ""

# 6. CREATE BACKUP INFO FILE
cat > "$BACKUP_DIR/BACKUP_INFO.txt" << EOF
OpenClaw Backup Information
===========================

Backup Type: $BACKUP_TYPE
Timestamp: $TIMESTAMP
Hostname: $HOSTNAME
Created: $(date)

Contents:
---------
📁 openclaw-workspace/ - AI agent configurations and memories
📁 mission-control/ - Mission Control database and schema
📁 scripts/ - Startup scripts and shell configuration
📁 repos/ - Git repository archives

Restoration:
------------
To restore from this backup:
1. cd into this backup directory
2. Run: ./RESTORE.sh
3. Follow the prompts

Or manually:
- Database: cp mission-control/mission-control.db ~/Projects/mission-control/
- Configs: cp -r openclaw-workspace/* ~/.openclaw/workspace/
- Scripts: cp scripts/* ~/

Important Notes:
---------------
⚠️  Remember to BACKUP before restoring - restoration overwrites files!
🔐 Keep backups secure - they contain sensitive configuration data
🔄 Daily backups are recommended for active development

Backup Retention:
----------------
Daily backups: 7 days
Weekly backups: 4 weeks
Monthly backups: 3 months
EOF

echo "${GREEN}✅ Backup info file created${NC}"

echo ""

# 7. CLEANUP OLD BACKUPS
echo "${BLUE}━━━ Cleaning up old backups ━━━${NC}"
if [ "$BACKUP_TYPE" = "daily" ] || [ "$BACKUP_TYPE" = "weekly" ]; then
    echo "${YELLOW}🗑️  Removing backups older than $RETENTION_DAYS days...${NC}"
    find "$BACKUP_BASE_DIR" -maxdepth 1 -type d -name "*_20*" -mtime +$RETENTION_DAYS -exec rm -rf {} + 2>/dev/null || true
    echo "${GREEN}✅ Old backups cleaned${NC}"
fi

echo ""

# 8. COMPLETION SUMMARY
echo "${GREEN}━━━ Backup Complete! ━━━${NC}"
echo ""
echo "📦 Backup Location: $BACKUP_DIR"
echo "📊 Backup Size: $(du -sh "$BACKUP_DIR" | cut -f1)"
echo ""
echo "🎯 To restore, run:"
echo "   cd '$BACKUP_DIR'"
echo "   ./RESTORE.sh"
echo ""
echo "🔗 Next steps:"
echo "   1. Verify backup size and contents"
echo "   2. Test restoration on a different machine"
echo "   3. Set up automatic daily backups with cron"
echo "   4. Consider cloud backup for redundancy"
echo ""
echo "${BLUE}💡 Pro tip: Add this to crontab for daily backups:${NC}"
echo "   0 2 * * * $HOME/backup-openclaw.sh daily >> $HOME/OpenClaw-Backups/backup.log 2>&1"
echo ""
echo "${GREEN}✅ Backup finished at $(date)${NC}"
