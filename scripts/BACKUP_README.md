# OpenClaw Backup & Recovery System

This document describes the backup strategy for your OpenClaw setup, including automated backups, manual backups, and disaster recovery procedures.

## 📦 What Gets Backed Up

### 1. OpenClaw Workspace (`~/.openclaw/workspace/`)
- **SOUL.md** - Agent personality and identity
- **USER.md** - User preferences and context
- **AGENTS.md** - Agent collaboration guidelines
- **MEMORY.md** - Long-term memory storage
- **IDENTITY.md** - Agent identity configuration
- **TOOLS.md** - Tool-specific notes
- **HEARTBEAT.md** - Automated check configuration
- **memory/** - Daily memory logs
- **agents/** - Agent configuration directories

### 2. Mission Control Database & Configuration
- **mission-control.db** - SQLite database (tasks, agents, prompts, activities)
- **schema.ts** - Database schema definition
- **migrations/** - Database migration files
- **seed-prompts.sql** - Default system prompts
- **.env.local** - Environment configuration

### 3. Scripts & Aliases
- **start-mission-control.sh** - Startup script
- **.zshrc** - Shell configuration with aliases (`mc=`)
- **Exported aliases** - For easy restoration

### 4. Git Repositories
- **Mission Control source code** - Complete repository (excluding node_modules)

## 🚀 Quick Start

### Make Your First Backup

```bash
# Make the script executable (only once)
chmod +x ~/backup-openclaw.sh

# Run a manual backup
~/backup-openclaw.sh manual

# Or run a daily backup (recommended for cron)
~/backup-openclaw.sh daily
```

### Backup Output

Backups are stored in: `~/OpenClaw-Backups/`

Structure:
```
~/OpenClaw-Backups/
├── daily_2026-02-05_00-30-00/
│   ├── BACKUP_INFO.txt
│   ├── RESTORE.sh
│   ├── openclaw-workspace/
│   ├── mission-control/
│   ├── scripts/
│   └── repos/
├── weekly_2026-02-02_
└── manual_2026-02-01_
```

## 🔄 Automated Daily Backups

### Method 1: Cron Job (Recommended)

```bash
# Open your crontab
crontab -e

# Add this line for daily backup at 2:00 AM
0 2 * * * /Users/snashaat/backup-openclaw.sh daily >> /Users/snashaat/OpenClaw-Backups/backup.log 2>&1

# Save and exit
```

### Method 2: LaunchAgent (macOS Native)

Create a plist file:

```bash
cat > ~/Library/LaunchAgents/com.openclaw.backup.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.backup</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/snashaat/backup-openclaw.sh</string>
        <string>daily</string>
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
</dict>
</plist>
EOF

# Load the LaunchAgent
launchctl load ~/Library/LaunchAgents/com.openclaw.backup.plist

# Verify it's loaded
launchctl list | grep com.openclaw.backup
```

## ♻️ Restoration

### Full Restoration

```bash
# Navigate to a backup directory
cd ~/OpenClaw-Backups/manual_2026-02-05_00-30-00

# Run the restoration script
./RESTORE.sh

# Follow the prompts
```

### Partial Restoration

#### Restore Only Database
```bash
cp ~/OpenClaw-Backups/manual_*/mission-control/mission-control.db \
   ~/Projects/mission-control/
```

#### Restore Only Agent Configs
```bash
cp -r ~/OpenClaw-Backups/manual_*/openclaw-workspace/agents/ \
   ~/.openclaw/workspace/
```

#### Restore Only Memories
```bash
cp -r ~/OpenClaw-Backups/manual_*/openclaw-workspace/memory/ \
   ~/.openclaw/workspace/
```

### Mission Control Code Restore

```bash
# Extract from archive
cd ~/Projects
rm -rf mission-control  # ⚠️  WARNING: Deletes current code

tar -xzf ~/OpenClaw-Backups/manual_*/repos/mission-control-repo.tar.gz

# Reinstall dependencies
cd mission-control
npm install

# Build
npm run build
```

## 💡 Best Practices

### 1. Backup Regularly
- **Daily** - Automated at 2 AM
- **Manual** - Before major changes
- **Weekly** - Full system snapshot

### 2. Test Restoration
- Test restore to a different directory monthly
- Verify database can be read
- Check mission control starts correctly

### 3. Multiple Backup Locations
```bash
# Copy to external drive
cp -r ~/OpenClaw-Backups /Volumes/ExternalDrive/

# Or use rsync for efficiency
rsync -av --delete ~/OpenClaw-Backups/ /Volumes/ExternalDrive/OpenClaw-Backups/

# Or cloud sync (iCloud, Dropbox, etc.)
ln -s ~/OpenClaw-Backups ~/Dropbox/OpenClaw-Backups
```

### 4. Retention Policy
The backup script automatically:
- Keeps **7 days** of daily backups
- Keeps **4 weeks** of weekly backups
- Manual backups are kept **indefinitely**

### 5. Monitor Backup Health
```bash
# Check backup size
du -sh ~/OpenClaw-Backups/* | sort -h | tail -5

# Check backup age
ls -lt ~/OpenClaw-Backups/ | head -10

# Check backup log
tail -50 ~/OpenClaw-Backups/backup.log
```

## 🆘 Emergency Recovery

### Scenario 1: Database Corruption
```bash
# Stop Mission Control
pkill -f "next.*3000"

# Restore from backup
cp ~/OpenClaw-Backups/latest/mission-control/mission-control.db \
   ~/Projects/mission-control/

# Restart
mc
```

### Scenario 2: Complete System Reinstall
```bash
# 1. Restore workspace configs
./RESTORE.sh

# 2. Clone mission control from backup or GitHub
cd ~/Projects
git clone https://github.com/snashaat/-mission-control.git

# 3. Restore database
cp ~/OpenClaw-Backups/latest/mission-control/mission-control.db \
   mission-control/

# 4. Install dependencies
cd mission-control
npm install

# 5. Build and run
npm run build
mc
```

### Scenario 3: Agent Configuration Lost
```bash
# Restore agent configs
cp -r ~/OpenClaw-Backups/latest/openclaw-workspace/agents/ \
   ~/.openclaw/workspace/

# Restart OpenClaw gateway
openclaw gateway restart
```

## 🔒 Security Considerations

- Backups contain sensitive configuration data
- Database contains all task and conversation data
- Store backups in secure location
- Consider encrypting backups for cloud storage:
  ```bash
  tar -czf - ~/OpenClaw-Backups/latest | gpg -c > backup.tar.gz.gpg
  ```

## 📊 Backup Verification

Create a verification script:

```bash
cat > ~/verify-backup.sh << 'SCRIPT'
#!/bin/zsh
BACKUP_DIR="$1"

echo "Verifying backup: $BACKUP_DIR"

# Check critical files
[ -f "$BACKUP_DIR/mission-control/mission-control.db" ] && echo "✅ Database" || echo "❌ Database"
[ -f "$BACKUP_DIR/openclaw-workspace/SOUL.md" ] && echo "✅ SOUL.md" || echo "❌ SOUL.md"
[ -f "$BACKUP_DIR/scripts/start-mission-control.sh" ] && echo "✅ Start script" || echo "❌ Start script"
[ -f "$BACKUP_DIR/RESTORE.sh" ] && echo "✅ Restore script" || echo "❌ Restore script"

# Check sizes
ls -lh "$BACKUP_DIR/mission-control/mission-control.db"
du -sh "$BACKUP_DIR"
SCRIPT
chmod +x ~/verify-backup.sh
```

## 🎯 Maintenance Tasks

### Monthly
- [ ] Verify latest backup is valid
- [ ] Test restore procedure
- [ ] Clean up old backups (automated)
- [ ] Check backup sizes aren't growing too large

### Quarterly
- [ ] Full disaster recovery drill
- [ ] Update backup retention policy if needed
- [ ] Review and update backup script

---

**Remember:** Backups are only useful if you can restore them! Test regularly. 🛡️
