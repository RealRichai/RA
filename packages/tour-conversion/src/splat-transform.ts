import { spawn } from 'child_process';
import { accessSync, constants } from 'fs';
import { access, mkdir } from 'fs/promises';
import { dirname, join } from 'path';

import type { SplatTransformOptions, SplatTransformResult } from './types';

// =============================================================================
// Binary Resolution
// =============================================================================

/**
 * Resolve the path to the splat-transform binary
 * Prefers local node_modules binary over npx
 */
export function resolveBinaryPath(): { path: string; mode: 'local' | 'npx' } {
  // Try to find local binary in node_modules/.bin
  const localBinary = join(
    __dirname,
    '..',
    'node_modules',
    '.bin',
    'splat-transform'
  );

  // Check common locations for the binary
  const possiblePaths = [
    localBinary,
    join(process.cwd(), 'node_modules', '.bin', 'splat-transform'),
    join(__dirname, '..', '..', '..', 'node_modules', '.bin', 'splat-transform'),
  ];

  // In production, we always use local binary
  // The package.json pins the version for reproducibility
  for (const binPath of possiblePaths) {
    try {
      // Check if file exists and is executable synchronously for startup
      accessSync(binPath, constants.X_OK);
      return { path: binPath, mode: 'local' };
    } catch {
      // Continue to next path
    }
  }

  // Fallback: npx mode - binary not found locally
  throw new Error('splat-transform binary not found in local paths');
}

/**
 * Get binary info for provenance tracking
 */
export function getBinaryInfo(): { path: string; mode: 'local' | 'npx' } {
  try {
    return resolveBinaryPath();
  } catch {
    // If resolution fails, we'll use npx as fallback (not recommended)
    return { path: 'npx @playcanvas/splat-transform', mode: 'npx' };
  }
}

// =============================================================================
// Version Detection
// =============================================================================

/**
 * Get the version of the splat-transform CLI
 */
export async function getSplatTransformVersion(): Promise<string> {
  const { path: binaryPath, mode } = getBinaryInfo();

  return new Promise((resolve, reject) => {
    let proc;

    if (mode === 'local') {
      proc = spawn(binaryPath, ['--version'], { shell: false });
    } else {
      // Fallback to npx (not recommended for production)
      proc = spawn('npx', ['@playcanvas/splat-transform', '--version'], {
        shell: true,
      });
    }

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

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Run the splat-transform CLI to convert PLY to SOG format
 * Uses local binary by default (no npx dependency at runtime)
 */
export async function runSplatTransform(
  options: SplatTransformOptions
): Promise<SplatTransformResult & { binaryMode: 'local' | 'npx'; binaryPath: string }> {
  const startTime = Date.now();
  const { path: binaryPath, mode: binaryMode } = getBinaryInfo();

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
      binaryMode,
      binaryPath,
    };
  }

  return new Promise((resolve) => {
    let proc;
    const args = [
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

    if (binaryMode === 'local') {
      proc = spawn(binaryPath, args, {
        shell: false,
        env: {
          ...process.env,
          // Force deterministic behavior for reproducible builds
          SPLAT_SEED: '42',
        },
      });
    } else {
      // Fallback to npx (logs warning)
      console.warn(
        '[splat-transform] Using npx fallback. Install @playcanvas/splat-transform locally for better performance.'
      );
      proc = spawn('npx', ['@playcanvas/splat-transform', ...args], {
        shell: true,
        env: {
          ...process.env,
          SPLAT_SEED: '42',
        },
      });
    }

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
        binaryMode,
        binaryPath,
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
        binaryMode,
        binaryPath,
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
): Promise<SplatTransformResult & { binaryMode: 'local' | 'npx'; binaryPath: string }> {
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
    binaryMode: 'local',
    binaryPath: 'mock',
  };
}

/**
 * Wrapper that uses mock in test environment
 */
export async function convertPlyToSog(
  options: SplatTransformOptions,
  useMock = false
): Promise<SplatTransformResult & { binaryMode: 'local' | 'npx'; binaryPath: string }> {
  if (useMock || process.env['NODE_ENV'] === 'test') {
    return mockSplatTransform(options);
  }
  return runSplatTransform(options);
}
