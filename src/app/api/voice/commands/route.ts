// API endpoint for voice command processing
// POST /api/voice/commands - Process spoken commands

import { NextRequest, NextResponse } from 'next/server';
import { parseVoiceCommand, executeVoiceCommand, getVoiceCommandsHelp } from '@/lib/voice/commands';
import { queryOne, run } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, audioBase64, conversationId, userId } = body;

    if (!text && !audioBase64) {
      return NextResponse.json(
        { error: 'Text or audio is required' },
        { status: 400 }
      );
    }

    // If audio provided, we'd use STT here (Web Speech API in browser is better)
    // For now, we expect text from browser's SpeechRecognition API
    const commandText = text || '';

    // Parse the voice command
    const parsedCommand = parseVoiceCommand(commandText);

    // Log command to database
    const commandId = uuidv4();
    run(
      `INSERT INTO voice_commands (id, raw_text, parsed_type, confidence, params, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [commandId, commandText, parsedCommand.type, parsedCommand.confidence, JSON.stringify(parsedCommand.params)]
    );

    // Execute the command
    const result = await executeVoiceCommand(parsedCommand, { userId });

    // Generate voice response (TTS) if successful
    let audioUrl: string | null = null;
    if (result.success) {
      // Call internal TTS endpoint
      try {
        const ttsRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/voice/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: result.message }),
        });
        
        if (ttsRes.ok) {
          const ttsData = await ttsRes.json();
          audioUrl = ttsData.audioUrl;
        }
      } catch (ttsError) {
        console.error('TTS generation failed:', ttsError);
      }
    }

    return NextResponse.json({
      success: result.success,
      command: parsedCommand,
      result,
      audioUrl,
      spokenResponse: result.message,
    });

  } catch (error) {
    console.error('Voice command error:', error);
    return NextResponse.json(
      { error: 'Failed to process voice command', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET /api/voice/commands - Get available commands and history
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (type === 'help') {
      // Return available commands
      const commands = getVoiceCommandsHelp();
      return NextResponse.json({ commands });
    }

    // Get command history
    const limit = parseInt(searchParams.get('limit') || '10');
    
    const history = queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM voice_commands WHERE created_at > datetime('now', '-24 hours')`
    );

    const recentCommands = queryOne<any[]>(
      `SELECT * FROM voice_commands ORDER BY created_at DESC LIMIT ?`,
      [limit]
    ) || [];

    return NextResponse.json({
      stats: {
        commandsToday: history?.count || 0,
      },
      recentCommands,
    });

  } catch (error) {
    console.error('Error fetching voice commands:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voice commands' },
      { status: 500 }
    );
  }
}
