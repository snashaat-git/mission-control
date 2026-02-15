# Voice Calls

Mission Control integrates with the OpenClaw voice-call plugin to make and receive phone calls through your AI agents.

## Prerequisites

1. **OpenClaw Gateway** running with the `voice-call` plugin enabled
2. **Twilio** (or Telnyx/Plivo) account with a phone number
3. **ElevenLabs** account (optional, for high-quality TTS)
4. **ngrok** (for exposing webhooks to the internet)

## Setup

### 1. Install ngrok

ngrok creates a public URL that routes to your local voice webhook server.

```bash
# Download and install
cd ~/bin
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.zip
unzip ngrok-v3-stable-linux-amd64.zip
chmod +x ngrok

# Add auth token (get from https://dashboard.ngrok.com)
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

### 2. Configure Voice Call Plugin

Edit `~/.openclaw/openclaw.json` and ensure the voice-call plugin is configured:

```json
{
  "plugins": {
    "entries": {
      "voice-call": {
        "enabled": true,
        "config": {
          "provider": "twilio",
          "publicUrl": "https://YOUR-NGROK-URL.ngrok-free.app/voice/webhook",
          "skipSignatureVerification": true,
          "twilio": {
            "accountSid": "AC...",
            "authToken": "...",
            "phoneNumber": "+1234567890"
          },
          "tts": {
            "provider": "elevenlabs",
            "elevenlabs": {
              "apiKey": "sk_...",
              "voiceId": "21m00Tcm4TlvDq8ikWAM",
              "modelId": "eleven_multilingual_v2"
            }
          }
        }
      }
    }
  }
}
```

### 3. Auto-Start ngrok (Recommended)

Mission Control can automatically start ngrok when the server launches. This is enabled by default.

When the dev server starts, the instrumentation hook:
1. Checks for `~/bin/ngrok`
2. Starts a tunnel on port 3334 (or `VOICE_WEBHOOK_PORT`)
3. Detects the public URL
4. Updates `publicUrl` in `openclaw.json`
5. Saves the PID to `~/.openclaw/.ngrok.pid`

To disable: set `NGROK_AUTOSTART=false` in your environment.

### 4. Configure from Settings UI

You can also manage voice call settings from **Settings > Voice Calls**:

- **Webhook URL** — Set manually or click "Detect ngrok" to auto-fill
- **From Number** — Default outgoing phone number
- **Inbound Policy** — Allow, block, or disable incoming calls
- **Inbound Greeting** — Message played to callers

## Making Calls

### From the Header

1. Click the **phone icon** in the header
2. The Voice Call Modal opens with two tabs:
   - **Dial** — Enter a phone number and message
   - **Contacts** — Pick from your phonebook

3. Choose the **call mode**:
   - **Conversation** — Two-way voice conversation with the agent
   - **Notify** — Agent speaks the message and hangs up (for notifications)

4. Click **Call**

### From an Agent Card

Click the **phone icon** on any agent card in the sidebar to open the dial modal pre-filled with that agent.

### Automatic Notifications

Tasks can be configured to call a phone number on completion or failure. See [Features > Task Notifications](./features.md#task-notifications).

## Phonebook

The dial modal includes a contacts tab where you can:

- **Add contacts** with name, phone number, and optional label
- **Search** contacts by name or number
- **Click to dial** any contact
- **Delete** contacts

## Call History

View past calls in the Call History section:

- Agent name and phone number
- Direction (inbound/outbound)
- Status and duration
- Transcript (if available)
- Click a row to view full details

## Troubleshooting

### "Application error occurred" on call
The webhook URL is not reachable. Ensure:
- ngrok is running (`curl http://127.0.0.1:4040/api/tunnels`)
- The `publicUrl` in openclaw.json points to the correct ngrok URL
- `skipSignatureVerification` is `true` (required for ngrok free tier)

### Call connects but hangs up immediately
The call mode is set to "notify" (speak and hang up). Switch to "conversation" mode in the dial modal.

### ngrok "1 simultaneous session" error
Only one ngrok process can run at a time on the free tier. Kill existing processes:
```bash
pkill -9 -f ngrok
```
Then restart Mission Control or run ngrok manually.

### ngrok URL changes on restart
Free ngrok URLs change every time. Mission Control's auto-start feature handles this automatically by updating `openclaw.json` on each launch.
