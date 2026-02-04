#!/bin/zsh
# Automated Backup Setup for OpenClaw
# This script sets up daily automated backups using macOS LaunchAgent

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "${BLUE}🔄 Setting up Automated OpenClaw Backups${NC}"
echo ""

# Check if backup script exists
if [ ! -f "$HOME/backup-openclaw.sh" ]; then
    echo "${RED}❌ Error: backup-openclaw.sh not found in home directory!${NC}"
    echo "${YELLOW}Please ensure backup-openclaw.sh exists at: $HOME/backup-openclaw.sh${NC}"
    exit 1
fi

# Make sure it's executable
chmod +x "$HOME/backup-openclaw.sh"
echo "${GREEN}✅ Backup script is executable${NC}"

# Create LaunchAgents directory if needed
mkdir -p "$HOME/Library/LaunchAgents"

# Check if already installed
if [ -f "$HOME/Library/LaunchAgents/com.openclaw.backup.plist" ]; then
    echo "${YELLOW}⚠️  LaunchAgent already exists${NC}"
    read "overwrite?Overwrite existing configuration? (y/n): "
    if [[ $overwrite != "y" ]]; then
        echo "${BLUE}Keeping existing configuration${NC}"
        exit 0
    fi
    # Unload existing
    launchctl unload "$HOME/Library/LaunchAgents/com.openclaw.backup.plist" 2>/dev/null || true
fi

# Create LaunchAgent plist
echo "${BLUE}📝 Creating LaunchAgent configuration...${NC}"

cat > "$HOME/Library/LaunchAgents/com.openclaw.backup.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>-c</string>
        <string>exec /Users/snashaat/backup-openclaw.sh daily</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/snashaat/OpenClaw-Backups/backup.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/snashaat/OpenClaw-Backups/backup.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>/Users/snashaat</string>
        <key>USER</key>
        <string>snashaat</string>
    </dict>
</dict>
</plist>
EOF

echo "${GREEN}✅ LaunchAgent configuration created${NC}"

# Load the LaunchAgent
echo "${BLUE}🚀 Loading LaunchAgent...${NC}"
launchctl load "$HOME/Library/LaunchAgents/com.openclaw.backup.plist"

echo "${GREEN}✅ LaunchAgent loaded successfully${NC}"

# Verify it's running
if launchctl list | grep -q "com.openclaw.backup"; then
    echo "${GREEN}✅ Backup service is now active${NC}"
else
    echo "${YELLOW}⚠️  Could not verify LaunchAgent status${NC}"
fi

# Create initial backup directory
echo "${BLUE}📁 Creating backup directory...${NC}"
mkdir -p "$HOME/OpenClaw-Backups"

echo ""
echo "${GREEN}━━━ Automated Backup Setup Complete! ━━━${NC}"
echo ""
echo "📅 Schedule: Daily at 2:00 AM"
echo "📁 Location: ~/OpenClaw-Backups/"
echo "📊 Log: ~/OpenClaw-Backups/backup.log"
echo ""
echo "🎯 Commands to manage backups:"
echo "   Run manual backup:       ~/backup-openclaw.sh manual"
echo "   Check service status:    launchctl list | grep openclaw"
echo "   Stop auto backups:       launchctl unload ~/Library/LaunchAgents/com.openclaw.backup.plist"
echo "   Start auto backups:      launchctl load ~/Library/LaunchAgents/com.openclaw.backup.plist"
echo ""
echo "🔍 Next steps:"
echo "   1. Run a test backup now: ~/backup-openclaw.sh manual"
echo "   2. Verify backup was created: ls -l ~/OpenClaw-Backups/"
echo "   3. Check backup log: tail ~/OpenClaw-Backups/backup.log"
echo "   4. Read full guide: cat ~/BACKUP_README.md"
echo ""
echo "${BLUE}💡 Test restoration:${NC}"
echo "   cd ~/OpenClaw-Backups/manual_*/"
echo "   ./RESTORE.sh"
echo ""
echo "${GREEN}Your OpenClaw setup is now automatically backed up daily! 🛡️${NC}"
