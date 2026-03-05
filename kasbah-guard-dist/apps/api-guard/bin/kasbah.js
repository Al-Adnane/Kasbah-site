#!/usr/bin/env node

/**
 * Kasbah Guard — CLI
 * 
 * Command-line interface for scanning files and directories.
 * 
 * Usage:
 *   kasbah scan .env
 *   kasbah scan ./src --json
 *   kasbah redact config.json
 *   kasbah watch ./src
 */

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { scan, scanFile, scanDirectory, redact } = require('./detector');

const program = new Command();

program
  .name('kasbah')
  .description('Kasbah Guard - Secret Detection CLI')
  .version('1.0.0');

// Scan command
program
  .command('scan <path>')
  .description('Scan a file or directory for secrets')
  .option('-j, --json', 'Output as JSON')
  .option('-r, --recursive', 'Scan recursively', true)
  .option('-d, --depth <number>', 'Max depth for recursive scan', '10')
  .option('-e, --exclude <patterns>', 'Exclude patterns (comma-separated)', 'node_modules,vendor,.git,dist,build')
  .option('--min-risk <number>', 'Minimum risk to report', '40')
  .action(async (filePath, options) => {
    try {
      const absolutePath = path.resolve(process.cwd(), filePath);
      const stats = fs.statSync(absolutePath);
      
      let results;
      
      if (stats.isFile()) {
        results = [await scanFile(absolutePath)];
      } else if (stats.isDirectory()) {
        results = await scanDirectory(absolutePath, {
          recursive: options.recursive,
          maxDepth: parseInt(options.depth),
          exclude: options.exclude.split(',')
        });
      } else {
        console.error(chalk.red('Error: Path is neither file nor directory'));
        process.exit(1);
      }
      
      // Filter by minimum risk
      const minRisk = parseInt(options.minRisk);
      results = results.filter(r => r.risk >= minRisk);
      
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        printResults(results);
      }
      
      // Exit with error if any DENY decisions
      const hasDeny = results.some(r => r.decision === 'DENY');
      if (hasDeny) {
        console.log(chalk.red('\n❌ Secrets detected! Review the findings above.'));
        process.exit(2);
      } else if (results.length > 0) {
        console.log(chalk.yellow('\n⚠️  Warnings found. Review the findings above.'));
        process.exit(1);
      } else {
        console.log(chalk.green('\n✅ No secrets detected!'));
        process.exit(0);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Redact command
program
  .command('redact <file>')
  .description('Redact sensitive data from a file')
  .option('-o, --output <file>', 'Output file (default: overwrite input)')
  .option('--dry-run', 'Show redacted content without writing')
  .action(async (filePath, options) => {
    try {
      const absolutePath = path.resolve(process.cwd(), filePath);
      const content = fs.readFileSync(absolutePath, 'utf8');
      const redacted = redact(content);
      
      if (options.dryRun) {
        console.log(redacted);
      } else {
        const outputPath = options.output 
          ? path.resolve(process.cwd(), options.output)
          : absolutePath;
        fs.writeFileSync(outputPath, redacted);
        console.log(chalk.green(`✅ Redacted content written to ${outputPath}`));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Watch command
program
  .command('watch <path>')
  .description('Watch a directory for changes and scan automatically')
  .option('-d, --depth <number>', 'Max depth', '5')
  .action(async (dirPath, options) => {
    try {
      const chokidar = require('chokidar');
      const absolutePath = path.resolve(process.cwd(), dirPath);
      
      console.log(chalk.blue(`👁️  Watching ${absolutePath} for changes...`));
      console.log(chalk.blue('Press Ctrl+C to stop\n'));
      
      const watcher = chokidar.watch(absolutePath, {
        ignored: /node_modules|\.git|vendor|dist|build/,
        persistent: true,
        depth: parseInt(options.depth)
      });
      
      watcher.on('change', async (filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.ts') || 
            filePath.endsWith('.json') || filePath.endsWith('.env') ||
            filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
          const result = await scanFile(filePath);
          if (result.risk >= 40) {
            console.log(chalk.yellow(`\n[${new Date().toLocaleTimeString()}] ${path.relative(absolutePath, filePath)}`));
            console.log(chalk.yellow(`  Risk: ${result.risk}/100 - ${result.decision}`));
            if (result.violations.length > 0) {
              result.violations.forEach(v => {
                console.log(chalk.gray(`    • ${v.type}`));
              });
            }
          }
        }
      });
      
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('chokidar')) {
        console.error(chalk.red('Error: chokidar is required for watch mode. Install with: npm install -g chokidar'));
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// Self-test command
program
  .command('selftest')
  .description('Run internal self-tests')
  .action(() => {
    console.log(chalk.blue('Running Kasbah Guard self-tests...\n'));
    
    const tests = [
      {
        name: 'AWS Access Key Detection',
        input: 'AKIAIOSFODNN7EXAMPLE',
        expect: true
      },
      {
        name: 'GitHub PAT Detection',
        input: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        expect: true
      },
      {
        name: 'OpenAI Key Detection',
        input: 'sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        expect: true
      },
      {
        name: 'SSN Detection',
        input: 'My SSN is 123-45-6789',
        expect: true
      },
      {
        name: 'Discord Token Detection',
        input: 'TEST_DISCORD_USER_TOKEN_0000',
        expect: true
      },
      {
        name: 'Safe Text',
        input: 'Hello, this is safe text with no secrets.',
        expect: false
      },
      {
        name: 'Private Key Detection',
        input: '-----BEGIN RSA PRIVATE KEY-----',
        expect: true
      },
      {
        name: 'Database URI Detection',
        input: 'mongodb://user:password@host:27017/db',
        expect: true
      },
      {
        name: 'Slack Token Detection',
        input: 'TEST_SLACK_BOT_TOKEN_0000',
        expect: true
      },
      {
        name: 'Credit Card Detection',
        input: '4532-1234-5678-9999',
        expect: true
      }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
      const result = scan(test.input);
      const success = result.risk > 0 === test.expect;
      
      if (success) {
        console.log(chalk.green(`  ✓ ${test.name}`));
        passed++;
      } else {
        console.log(chalk.red(`  ✗ ${test.name}`));
        console.log(chalk.gray(`    Expected: ${test.expect}, Got: ${result.risk > 0}`));
        failed++;
      }
    }
    
    console.log(`\n${passed}/${tests.length} tests passed`);
    
    if (failed > 0) {
      process.exit(1);
    }
  });

// Helper function to print results
function printResults(results) {
  for (const result of results) {
    const icon = result.decision === 'DENY' ? '🛑' : result.decision === 'WARN' ? '⚠️' : '✅';
    const color = result.decision === 'DENY' ? chalk.red : result.decision === 'WARN' ? chalk.yellow : chalk.green;
    
    console.log(color(`\n${icon} ${result.file || 'Input'}`));
    console.log(color(`   Risk: ${result.risk}/100 - ${result.decision}`));
    console.log(color(`   Reason: ${result.reason}`));
    
    if (result.violations && result.violations.length > 0) {
      result.violations.forEach(v => {
        console.log(chalk.gray(`     • ${v.type} (${v.matches || v.count} matches)`));
      });
    }
  }
}

program.parse(process.argv);
