import { spawn } from 'child_process';
import { access, mkdir } from 'fs/promises';
import { dirname } from 'path';

import type { SplatTransformOptions, SplatTransformResult } from './types';

/**
 * Get the version of the splat-transform CLI
 */
export async function getSplatTransformVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['@playcanvas/splat-transform', '--version'], {
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim() || '1.0.0');
      } else {
        reject(new Error(`Failed to get version: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * Run the splat-transform CLI to convert PLY to SOG format
 */
export async function runSplatTransform(
  options: SplatTransformOptions
): Promise<SplatTransformResult> {
  const startTime = Date.now();

  // Ensure output directory exists
  const outputDir = dirname(options.outputPath);
  await mkdir(outputDir, { recursive: true });

  // Verify input file exists
  try {
    await access(options.inputPath);
  } catch {
    return {
      success: false,
      outputPath: options.outputPath,
      stderr: `Input file not found: ${options.inputPath}`,
      stdout: '',
      exitCode: 1,
      durationMs: Date.now() - startTime,
    };
  }

  return new Promise((resolve) => {
    const args = [
      '@playcanvas/splat-transform',
      options.inputPath,
      '-o', options.outputPath,
      '-i', options.iterations.toString(),
    ];

    if (options.format === 'sog') {
      args.push('--format', 'sog');
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    const proc = spawn('npx', args, {
      shell: true,
      env: {
        ...process.env,
        // Force deterministic behavior for reproducible builds
        SPLAT_SEED: '42',
      },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        outputPath: options.outputPath,
        stderr,
        stdout,
        exitCode: code ?? 1,
        durationMs: Date.now() - startTime,
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        outputPath: options.outputPath,
        stderr: err.message,
        stdout: '',
        exitCode: 1,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

/**
 * Mock splat-transform for testing
 * Creates a minimal valid SOG file structure
 */
export async function mockSplatTransform(
  options: SplatTransformOptions
): Promise<SplatTransformResult> {
  const startTime = performance.now();
  const { writeFile } = await import('fs/promises');

  // Ensure output directory exists
  const outputDir = dirname(options.outputPath);
  await mkdir(outputDir, { recursive: true });

  // Create a mock SOG file (minimal valid structure)
  const mockSogHeader = Buffer.from([
    0x53, 0x4F, 0x47, 0x00, // Magic: "SOG\0"
    0x01, 0x00, 0x00, 0x00, // Version: 1
    0x00, 0x00, 0x00, 0x00, // Gaussian count: 0 (placeholder)
    0x00, 0x00, 0x00, 0x00, // Reserved
  ]);

  await writeFile(options.outputPath, mockSogHeader);

  // Ensure measurable duration for tests
  const durationMs = Math.max(1, Math.ceil(performance.now() - startTime));

  return {
    success: true,
    outputPath: options.outputPath,
    stderr: '',
    stdout: `Mock conversion completed with ${options.iterations} iterations`,
    exitCode: 0,
    durationMs,
  };
}

/**
 * Wrapper that uses mock in test environment
 */
export async function convertPlyToSog(
  options: SplatTransformOptions,
  useMock = false
): Promise<SplatTransformResult> {
  if (useMock || process.env['NODE_ENV'] === 'test') {
    return mockSplatTransform(options);
  }
  return runSplatTransform(options);
}
