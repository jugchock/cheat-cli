'use strict';

require('./polyfills');

const chalk = require('chalk');
const fs = require('fs');
const glob = require('glob');
const inquirer = require('inquirer');
const path = require('path');

module.exports = function () {
  require('yargs')
    .command('* [sheet]', 'print cheat sheet', {}, argv => print(argv.sheet))
    .command('add <path> <value>', 'add a sheet or cheat to a sheet', {}, argv => add(argv.path, argv.value))
    .command('remove-sheet <sheet>', 'remove a cheat sheet', {}, argv => removeSheet(argv.sheet))
    .command('remove <path>', 'remove cheat from a sheet', {}, argv => remove(argv.path))
    .command('find <sheet> <search>', 'find a cheat in a sheet', {}, argv => findCheat(argv.sheet, argv.search))
    .help()
    .argv;
}

function listSheets() {
  return new Promise((resolve, reject) => {
    glob(path.join(__dirname, 'sheets', '*.json'), (err, files) => {
      if (err) {
        reject(err);
      } else {
        const fileNames = files.map(file => path.basename(file).replace('.json', ''));
        console.log('\n' + fileNames.join('\n') + '\n');
        resolve();
      }
    });
  });
}

function print(sheet) {
  if (!sheet) {
    listSheets()
      .then(() => process.exit(0))
      .catch(err => {
        console.log(err);
        process.exit(1);
      });

    return;
  }

  printSheet(sheet)
    .then(() => process.exit(0))
    .catch(err => {
      if (err === 'sheet not found') {
        process.exit(0);
        return;
      }

      console.log(err);
      process.exit(1);
    });
}

function add(path, value) {
  const pathParts = path.split('/');
  const sheetName = pathParts[0];

  ensureSheetExists(sheetName)
    .then(() => pathParts[1] ? addToSheet(sheetName, pathParts[1], value) : null)
    .then(() => printSheet(sheetName))
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

function removeSheet(sheet) {
  deleteSheet(sheet)
    .then(() => console.log(`${sheet} removed`))
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

function remove(path) {
  const pathParts = path.split('/');

  if (pathParts.length < 2) {
    console.error('expected path in the form of {sheet}/{cheat-name}, use remove-sheet to remove an entire sheet');
    process.exit(1);
    return;
  }

  const sheetName = pathParts[0];
  removeFromSheet(sheetName, pathParts[1])
    .then(() => printSheet(sheetName))
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

function findCheat(sheetName, search) {
  readSheet(sheetName)
    .then(cheatData => filterCheats(cheatData, search))
    .then(filteredObject => printCheatData(filteredObject))
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

function ensureSheetExists(sheetName) {
  return sheetExists(sheetName)
    .then(exists => {
      if (exists) {
        return Promise.resolve();
      }

      return writeSheet(sheetName, {});
    });
}

function sheetExists(sheetName) {
  return new Promise(resolve => {
    const fileName = `${sheetName}.json`;
    fs.exists(path.join(__dirname, 'sheets', fileName), exists => {
      resolve(exists);
    });
  });
}

function printSheet(sheetName) {
  return readSheet(sheetName)
    .catch(err => {
      if (err.code === 'ENOENT') {
        return inquirer
          .prompt({
            default: false,
            message: `${sheetName} not found, create it?`,
            name: 'shouldCreate',
            type: 'confirm',
          })
          .then(answers => {
            if (answers.shouldCreate) {
              return;
            }

            throw 'sheet not found';
          });
      }

      throw err;
    })
    .then(cheatData => printCheatData(cheatData));
}

function printCheatData(cheatData) {
  const keys = Object.keys(cheatData);
  const keyLength = keys.reduce((maxLength, key) => Math.max(maxLength, key.length), 0);
  const padAmount = keyLength + 2;

  console.log('');
  keys.forEach(key => {
    let keyParts = key.split('-');
    keyParts = keyParts.map(keyPart => {
      return {
        text: keyPart,
        color: colorizeKeyPart(keyPart)
      };
    });
    console.log(
      chalk[keyParts[0].color](keyParts[0].text) +
      (keyParts[1] ? chalk.red(' ') + chalk[keyParts[1].color](keyParts[1].text) : '') +
      (keyParts[2] ? chalk.red(' ') + chalk[keyParts[2].color](keyParts[2].text) : '') +
      (keyParts[3] ? chalk.red(' ') + chalk[keyParts[3].color](keyParts[3].text) : '') +
      (keyParts[4] ? chalk.red(' ') + chalk[keyParts[4].color](keyParts[4].text) : '') +
      (keyParts[5] ? chalk.red(' ') + chalk[keyParts[5].color](keyParts[5].text) : '') +
      (keyParts[6] ? chalk.red(' ') + chalk[keyParts[6].color](keyParts[6].text) : '') +
      ''.padEnd(padAmount - key.length) + cheatData[key]
    );
  });
  console.log('');
}

function colorizeKeyPart(keyPart) {
  switch (keyPart) {
    case 'cmd':
      return 'magenta';
    case 'ctrl':
    case 'control':
      return 'yellow';
    case 'alt':
    case 'option':
    case 'opt':
      return 'green';
    case 'fn':
      return 'red';
    case 'shift':
    case 'shft':
      return 'blue';
    case 'space':
    case '[space]':
    case 'up':
    case 'down':
    case 'left':
    case 'right':
    case 'delete':
    case 'enter':
      return 'cyan';
    default:
      return 'white';
  }
}

function addToSheet(sheetName, key, value) {
  return readSheet(sheetName)
    .then(cheatObject => {
      const objectToWrite = Object.assign({}, cheatObject, { [key]: value });
      return writeSheet(sheetName, objectToWrite);
    });
}

function removeFromSheet(sheetName, keyToRemove) {
  return readSheet(sheetName)
    .then(cheatData => {
      const objectToWrite = Object.keys(cheatData).reduce((object, key) => {
        if (key !== keyToRemove && key !== keyToRemove) {
          object[key] = cheatData[key];
        }

        return object;
      }, {});

      return writeSheet(sheetName, objectToWrite);
    });
}

function readSheet(sheetName) {
  return new Promise((resolve, reject) => {
    const pathString = getSheetPath(sheetName);
    fs.readFile(pathString, 'utf8', (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      try {
        let cheatData = JSON.parse(data);
        resolve(cheatData);
      } catch (err) {
        reject(err);
      }
    });
  });
}

function writeSheet(sheetName, cheatObject) {
  return new Promise((resolve, reject) => {
    const pathString = getSheetPath(sheetName);
    fs.writeFile(pathString, JSON.stringify(cheatObject), 'utf8', err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function deleteSheet(sheetName) {
  return new Promise((resolve, reject) => {
    const pathString = getSheetPath(sheetName);
    fs.unlink(pathString, err => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

function filterCheats(cheatData, search) {
  const searchLower = search.toLowerCase();
  return Object.keys(cheatData).reduce((printObject, key) => {
    const cheatValue = cheatData[key];
    if (cheatValue.toLowerCase().includes(searchLower)) {
      printObject[key] = cheatValue;
    }
    return printObject;
  }, {});
}

function getSheetPath(sheetName) {
  const fileName = `${sheetName}.json`;
  return path.join(__dirname, 'sheets', fileName);
}
