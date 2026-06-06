/**
 * Runs the repo's check tasks with concise, task-focused feedback instead of streaming
 * every tool log. Interactive terminals get a parallel full run with a live summary,
 * while non-TTY agentic runs start in parallel and report the first completed failure so
 * agentic repair loops get fast, focused feedback.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const checks = [
  { task: 'lint-js', label: 'Lint JS' },
  { task: 'lint-css', label: 'Lint CSS' },
  { task: 'ts', label: 'TypeScript' },
  { task: 'test-frontend', label: 'Test Frontend' },
  { task: 'test-server', label: 'Test Server' },
];

const skipLocalhostTestsEnv = 'INDIE_WEB_SKIP_LOCALHOST_TESTS';
let checkEnvOverrides = {};
const isInteractive = Boolean(process.stdout.isTTY);
const labelWidth = Math.max(...checks.map((check) => check.label.length));
const colors = {
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function color(text, colorName) {
  if (!isInteractive) {
    return text;
  }
  return `${colors[colorName]}${text}${colors.reset}`;
}

function styled(text, ...colorNames) {
  if (!isInteractive) {
    return text;
  }

  const prefix = colorNames.map((colorName) => colors[colorName]).join('');
  return `${prefix}${text}${colors.reset}`;
}

function statusGlyph(result, { isRunning = false } = {}) {
  if (!result) {
    return isRunning ? color('•', 'dim') : color('·', 'dim');
  }
  return result.exitCode === 0 ? color('✓', 'green') : color('x', 'red');
}

function formatRow(check, result, { isRunning = false } = {}) {
  if (!isInteractive) {
    return formatPlainRow(check, result, { isRunning });
  }

  const label = check.label.padEnd(labelWidth);
  let suffix = '';
  if (isRunning) {
    suffix = ' running...';
  } else if (result) {
    suffix = ` ${formatDuration(result.durationMs)}`;
  }

  return `${statusGlyph(result, { isRunning })} ${label}${suffix}`;
}

function formatPlainRow(check, result, { isRunning = false } = {}) {
  const label = check.label.padEnd(labelWidth);

  if (isRunning) {
    return `RUN  ${label}`;
  }

  if (!result) {
    return `WAIT ${label}`;
  }

  const status = result.exitCode === 0 ? 'PASS' : 'FAIL';
  return `${status} ${label} ${formatDuration(result.durationMs)}`;
}

function checkEnv() {
  const env = {
    ...process.env,
    ...checkEnvOverrides,
    TERM: process.env.TERM || 'xterm-256color',
  };

  if (isInteractive) {
    env.FORCE_COLOR = '1';
    delete env.NO_COLOR;
  }

  return env;
}

function renderInteractive(results, runningTasks = new Set()) {
  if (renderInteractive.hasRendered) {
    process.stdout.write(`\x1b[${checks.length}F`);
  }

  for (let index = 0; index < checks.length; index += 1) {
    const check = checks[index];
    const result = results.get(check.task);
    const line = formatRow(check, result, {
      isRunning: runningTasks.has(check.task),
    });

    process.stdout.write(`\x1b[2K${line}\n`);
  }

  renderInteractive.hasRendered = true;
}

renderInteractive.hasRendered = false;

function startCheck(check) {
  const startedAt = Date.now();
  const child = spawn('task', ['--silent', '--exit-code', check.task], {
    detached: true,
    env: checkEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  let settled = false;

  child.stdout.on('data', (chunk) => {
    output += chunk;
  });

  child.stderr.on('data', (chunk) => {
    output += chunk;
  });

  const promise = new Promise((resolve) => {
    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    }

    child.on('error', (error) => {
      finish({
        ...check,
        startedAt,
        durationMs: Date.now() - startedAt,
        exitCode: 1,
        output: `${output}${error.message}\n`,
      });
    });

    child.on('close', (exitCode, signal) => {
      finish({
        ...check,
        startedAt,
        durationMs: Date.now() - startedAt,
        exitCode: exitCode ?? 1,
        signal,
        output,
      });
    });
  });

  return {
    check,
    promise,
    kill() {
      if (settled || child.killed) {
        return;
      }
      killCheckProcess(child, 'SIGTERM');
      setTimeout(() => {
        if (!settled) {
          killCheckProcess(child, 'SIGKILL');
        }
      }, 1000).unref();
    },
  };
}

function killCheckProcess(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function printFailures(results) {
  const failures = results.filter((result) => result.exitCode !== 0);

  if (failures.length === 0) {
    return;
  }

  if (isInteractive) {
    console.log(styled('✖ Failures', 'bold', 'red'));
    console.log(styled('──────────', 'red'));
  } else {
    console.log('FAILURES');
  }

  for (const result of failures) {
    console.log();
    if (isInteractive) {
      console.log(
        `${styled('┌─', 'red')} ${styled(result.label, 'bold', 'red')} failed ` +
          `${styled(`exit ${result.exitCode}`, 'red')}  ` +
          `${styled(`run: task ${result.task}`, 'dim')}`,
      );
      console.log(
        `${styled('│', 'red')} ${styled(`task --silent --exit-code ${result.task}`, 'dim')}`,
      );
      console.log(`${styled('└─ output', 'red')}`);
    } else {
      console.log(
        `FAIL ${result.label} exit ${result.exitCode} | run: task ${result.task}`,
      );
      console.log(`cmd: task --silent --exit-code ${result.task}`);
      console.log('output:');
    }
    const output = cleanTaskOutput(result);
    process.stdout.write(output || '(no output)\n');
    if (output && !output.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }

  console.log();
}

function printSkippedTests(results) {
  const skippedTests = results.flatMap((result) => {
    return extractSkippedTests(result).map((testName) => ({
      label: result.label,
      testName,
    }));
  });

  if (skippedTests.length === 0) {
    return;
  }

  if (isInteractive) {
    console.log(styled('◇ Skipped Tests', 'bold', 'cyan'));
    console.log(styled('───────────────', 'cyan'));
  } else {
    console.log('SKIPPED TESTS');
  }

  for (const skippedTest of skippedTests) {
    console.log(`${skippedTest.label}: ${skippedTest.testName}`);
  }

  console.log();
}

function extractSkippedTests(result) {
  const skippedTests = [];

  for (const line of stripAnsi(result.output).split('\n')) {
    const checkMarkerMatch = line.match(
      /^\s*(?:#\s*)?LOCALHOST_BIND_SKIPPED_TEST (.+)$/,
    );
    if (checkMarkerMatch) {
      addSkippedTest(skippedTests, checkMarkerMatch[1]);
      continue;
    }

    const jestMatch = line.match(/^\s*○ skipped (.+)$/);
    if (jestMatch) {
      addSkippedTest(skippedTests, jestMatch[1]);
      continue;
    }

    const tapMatch = line.match(
      /^\s*(?:ok|not ok) \d+ - (.+?) # SKIP(?: .*)?$/,
    );
    if (tapMatch) {
      addSkippedTest(skippedTests, tapMatch[1]);
    }
  }

  return skippedTests;
}

function addSkippedTest(skippedTests, testName) {
  if (testName === 'localhost-dependent tests skipped by check runner') {
    return;
  }
  skippedTests.push(testName);
}

function cleanTaskOutput(result) {
  return result.output
    .split('\n')
    .filter(
      (line) =>
        !stripAnsi(line).startsWith(
          `task: Failed to run task "${result.task}"`,
        ),
    )
    .join('\n');
}

function stripAnsi(text) {
  const escapeCharacter = String.fromCharCode(27);
  return text.replace(new RegExp(`${escapeCharacter}\\[[0-9;]*m`, 'g'), '');
}

function printResults(results) {
  if (isInteractive) {
    console.log(styled('◆ Results', 'bold', 'cyan'));
    console.log(styled('─────────', 'cyan'));
  } else {
    console.log('RESULTS');
  }

  for (const result of results) {
    const retry = result.exitCode === 0 ? '' : `  run: task ${result.task}`;
    console.log(`${formatRow(result, result)}${retry}`);
  }
}

async function main() {
  const resultsByTask = new Map();
  await configureCheckEnvironment();

  if (isInteractive) {
    await runInteractiveChecks(resultsByTask);
  } else {
    await runNonInteractiveChecks(resultsByTask);
  }

  const results = checks
    .map((check) => resultsByTask.get(check.task))
    .filter((result) => result);

  printFailures(results);
  printSkippedTests(results);
  printResults(results);

  if (results.some((result) => result.exitCode !== 0)) {
    process.exitCode = 1;
  }
}

async function runInteractiveChecks(resultsByTask) {
  const runningTasks = new Set(checks.map((check) => check.task));
  const checkProcesses = checks.map((check) => startCheck(check));

  renderInteractive(resultsByTask, runningTasks);

  await Promise.all(
    checkProcesses.map(async (checkProcess) => {
      const result = await checkProcess.promise;
      resultsByTask.set(checkProcess.check.task, result);
      runningTasks.delete(checkProcess.check.task);
      renderInteractive(resultsByTask, runningTasks);
    }),
  );

  if (renderInteractive.hasRendered) {
    console.log();
  }
}

async function runNonInteractiveChecks(resultsByTask) {
  const checkProcesses = checks.map((check) => {
    console.log(formatRow(check, undefined, { isRunning: true }));
    return startCheck(check);
  });

  let firstFailure = null;
  const successfulResults = [];

  await Promise.all(
    checkProcesses.map(async (checkProcess) => {
      const result = await checkProcess.promise;
      if (result.exitCode !== 0) {
        if (!firstFailure) {
          firstFailure = result;
          resultsByTask.set(result.task, result);
          console.log(formatRow(result, result));

          for (const otherProcess of checkProcesses) {
            if (otherProcess !== checkProcess) {
              otherProcess.kill();
            }
          }
        }
        return;
      }

      if (!firstFailure) {
        successfulResults.push(result);
      }
    }),
  );

  if (!firstFailure) {
    for (const result of successfulResults) {
      resultsByTask.set(result.task, result);
      console.log(formatRow(result, result));
    }
  }
}

async function configureCheckEnvironment() {
  if (await canBindLocalhost()) {
    return;
  }

  checkEnvOverrides = {
    [skipLocalhostTestsEnv]: '1',
  };
}

async function canBindLocalhost() {
  return new Promise((resolve) => {
    const server = createServer();
    let settled = false;

    function finish(canBind) {
      if (settled) {
        return;
      }
      settled = true;
      server.close(() => resolve(canBind));
    }

    server.once('error', () => finish(false));
    server.listen(0, '127.0.0.1', () => finish(true));
  });
}

await main();
