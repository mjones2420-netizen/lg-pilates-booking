// progress-reporter.js
//
// Writes running totals to .test-progress.json as each test finishes, so the
// Claude Code "test-progress" mod can show a live progress band. Reads nothing,
// changes no test behaviour. With retries, each test counts once, by its latest result.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '.test-progress.json');

class ProgressReporter {
  onBegin(config, suite) {
    this.total = suite.allTests().length;
    this.startedAt = Date.now();
    // Latest result per test: a retry (CI re-runs whole serial groups) replaces, never adds.
    this.results = new Map();
    this.write(false);
  }

  onTestEnd(test, result) {
    // Test ID from the title ("CU-08 — ..."), else from the file name ("cu-01-...").
    const base = path.basename(test.location.file);
    const id = (test.title.match(/^[a-z]+-\d+/i) || base.match(/^[a-z]+-\d+/i) || [base])[0].toUpperCase();
    this.results.set(test.id, { status: result.status, id });
    this.write(false);
  }

  onEnd(result) {
    this.write(true, result.status);
  }

  write(isDone, status) {
    const all = [...this.results.values()];
    const passed = all.filter(r => r.status === 'passed').length;
    const skipped = all.filter(r => r.status === 'skipped').length;
    const failedIds = all.filter(r => r.status !== 'passed' && r.status !== 'skipped').map(r => r.id);
    const data = {
      total: this.total,
      done: all.length,
      passed,
      failed: failedIds.length,
      skipped,
      failures: [...new Set(failedIds)],
      startedAt: this.startedAt,
      updatedAt: Date.now(),
      isDone,
      status: status || null,
    };
    try {
      fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(data));
      fs.renameSync(`${FILE}.tmp`, FILE);
    } catch (e) {
      // Progress display is optional; never fail a run over it.
    }
  }

  printsToStdio() {
    return false;
  }
}

module.exports = ProgressReporter;
