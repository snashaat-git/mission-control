// API endpoint for text-to-speech using sherpa-onnx
// POST /api/voice/speak - Convert text to speech

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);

interface TTSRequest {
  text: string;
  voice?: string;
  speed?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: TTSRequest = await request.json();
    const { text, voice = 'en_US-lessac-high', speed = 1.0 } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // Limit text length
    if (text.length > 1000) {
      return NextResponse.json(
        { error: 'Text too long (max 1000 characters)' },
        { status: 400 }
      );
    }

    // Setup paths
    const ttsBaseDir = process.env.SHERPA_ONNX_TTS_DIR || '/Users/snashaat/.openclaw/tools/sherpa-onnx-tts';
    const runtimeDir = path.join(ttsBaseDir, 'runtime');
    const modelDir = path.join(ttsBaseDir, 'models', `vits-piper-${voice}`);
    const outputDir = path.join(process.cwd(), 'public', 'audio', 'tts');
    
    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    // Generate unique filename
    const hash = crypto.createHash('md5').update(text).digest('hex').substring(0, 8);
    const outputFile = path.join(outputDir, `tts-${hash}-${Date.now()}.wav`);
    const outputFileName = path.basename(outputFile);

    // Check if sherpa-onnx-offline-tts exists
    const ttsBinary = path.join(runtimeDir, 'bin', 'sherpa-onnx-offline-tts');
    
    try {
      await execAsync(`test -f ${ttsBinary}`);
    } catch {
      // Fallback to system tts or return error
      console.log('sherpa-onnx-offline-tts not found, using fallback');
      
      // For now, return text with null audio
      // In production, you'd want a fallback TTS service
      return NextResponse.json({
        success: true,
        text,
        audioUrl: null,
        fallback: true,
        message: 'TTS binary not found, returning text only',
      });
    }

    // Prepare model files
    const modelFile = path.join(modelDir, `${voice}.onnx`);
    const tokensFile = path.join(modelDir, 'tokens.txt');

    // Check if model exists
    try {
      await execAsync(`test -f ${modelFile} && test -f ${tokensFile}`);
    } catch {
      return NextResponse.json({
        success: false,
        error: 'TTS model files not found',
        modelFile,
        tokensFile,
      }, { status: 500 });
    }

    // Create temp text file
    const textFile = path.join(outputDir, `input-${hash}.txt`);
    await writeFile(textFile, text, 'utf-8');

    // Run TTS
    const ttsCommand = `${ttsBinary} \
      --vits-model=${modelFile} \
      --vits-tokens=${tokensFile} \
      --vits-data-dir=${modelDir} \
      --output-filename=${outputFile} \
      --speed=${speed} \
      --sid=0 \
      < ${textFile}`;

    try {
      await execAsync(ttsCommand, { timeout: 30000 });
      
      // Clean up temp file
      await execAsync(`rm -f ${textFile}`);

      // Return audio URL
      const audioUrl = `/audio/tts/${outputFileName}`;

      return NextResponse.json({
        success: true,
        text,
        audioUrl,
        duration: estimateDuration(text),
        voice,
        speed,
      });

    } catch (ttsError) {
      console.error('TTS execution error:', ttsError);
      
      // Clean up on error
      await execAsync(`rm -f ${textFile} ${outputFile}`).catch(() => {});
      
      return NextResponse.json({
        success: false,
        text,
        audioUrl: null,
        error: 'TTS generation failed',
        fallbackMessage: text,
      }, { status: 500 });
    }

  } catch (error) {
    console.error('TTS API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate speech', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET /api/voice/speak/voices - List available voices
export async function GET(request: NextRequest) {
  try {
    const modelsDir = '/Users/snashaat/.openclaw/tools/sherpa-onnx-tts/models';
    
    try {
      const { stdout } = await execAsync(`ls -1 ${modelsDir}`);
      const voices = stdout.trim().split('\n').filter(v => v.startsWith('vits-piper-')).map(v => ({
        id: v.replace('vits-piper-', ''),
        name: v.replace('vits-piper-', '').replace(/-/g, ' ').toUpperCase(),
      }));

      return NextResponse.json({ voices });
    } catch {
      // Return default voice info
      return NextResponse.json({
        voices: [
          { id: 'en_US-lessac-high', name: 'EN US LESSAC (HIGH QUALITY)' },
        ],
        note: 'Using default voice configuration',
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list voices' },
      { status: 500 }
    );
  }
}

// Estimate audio duration from text
function estimateDuration(text: string): number {
  // Average speaking rate: ~150 words per minute
  const words = text.split(/\s+/).length;
  return Math.ceil((words / 150) * 60);
}
