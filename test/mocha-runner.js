'use strict';

const fs = require('fs');
const path = require('path');
const Mocha = require('mocha');
const uuidv1 = require('uuid/v1');

class MochaRunner {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this._tmps = [];
    this._mocha = new Mocha(options);
  }

  /**
   * Run tests
   * @param {Array} tests
   * @returns {Promise}
   */
  run(tests) {
    return new Promise((resolve, reject) => {
      tests.forEach(test => {
        const testDir = path.dirname(test);
        const tmpTest = path.join(testDir, `${uuidv1()}.spec.js`);
        
        fs.writeFileSync(tmpTest, fs.readFileSync(test));
        this._tmps.push(tmpTest);
        this._mocha.addFile(tmpTest);
      });

      this._mocha.run(err => {
        return err ? reject(err) : resolve();
      });
    }).catch(() => {
      // return this.cleanup();
    });
  }

  /**
   * Get mocha instance
   * @returns {Mocha}
   */
  getMocha() {
    return this._mocha;
  }

  /**
   * Remove tmp test files
   * @returns {Promise}
   */
  cleanup() {
    this._tmps.forEach(tmpTest => {
      fs.unlinkSync(tmpTest);
    });

    return Promise.resolve();
  }
}

module.exports = MochaRunner;