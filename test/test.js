import {writeFileSync, readFileSync} from 'node:fs';
import {strictEqual} from 'node:assert';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import hardhat from 'hardhat';
import solc from 'solc';
import {
  deleteS3Keys,
  MockStatusReporter,
  execPromise,
} from 'circuitscan-pipeline-runner';

import noirPipeline from '../src/index.js';

const INPUT_NAME = 'test_input';
const EVENT = {
  payload: {
    pipeline: 'noir',
    files: [
      {
        filename: 'src/main.nr',
        content: 'fn main(x: Field, y: pub Field) {\n' +
          '    assert(x != y);\n' +
          '}\n' +
          '\n' +
          '#[test]\n' +
          'fn test_main() {\n' +
          '    main(1, 2);\n' +
          '\n' +
          '    // Uncomment to make test fail\n' +
          '    // main(1, 1);\n' +
          '}\n'
      }
    ],
    nargoToml: '[package]\n' +
      'name = "hello_world"\n' +
      'type = "bin"\n' +
      'authors = [""]\n' +
      'compiler_version = ">=0.33.0"\n' +
      '\n' +
      '[dependencies]',
    noirupVersion: '0.33.0'
  },
  input: `
    x = 3
    y = 4
  `,
  circuitName: 'hello_world',
  publicInputs: 1,
};

describe('Noir pipeline', function () {
  it(`should make a package that can prove and verify`, async function () {
    this.timeout(20000);
    const status = new MockStatusReporter;

    let pkgName;
    try {
      pkgName = await noirPipeline(EVENT, { status });
    } catch(error) {
      if(('test' in EVENT) && (typeof EVENT.test.checkFail === 'function')) {
        strictEqual(EVENT.test.checkFail(status.logs, error), true);
        return;
      }
      throw error;
    }

    const dirPkg = join(tmpdir(), pkgName);
    writeFileSync(join(dirPkg, 'Prover.toml'), EVENT.input);
    await execPromise(`nargo execute ${INPUT_NAME}`, { cwd: dirPkg });
    await execPromise(
      `bb prove -b ./target/${EVENT.circuitName}.json -w ./target/${INPUT_NAME}.gz -o ./target/proof`,
      { cwd: dirPkg }
    );
    const proofBuffer = readFileSync(join(dirPkg, 'target', 'proof'));
    // TODO support >1 publicInputs
    const publicInputsHex = '0x' + proofBuffer.slice(0, EVENT.publicInputs * 32).toString('hex');
    const proofHex = '0x' + proofBuffer.slice(EVENT.publicInputs * 32).toString('hex');

    // Compile the contract
    const solidityPath = join(dirPkg, 'target', `contract.sol`);
    const input = {
      language: 'Solidity',
      sources: {
        'TestVerifier.sol': {
          content: readFileSync(solidityPath, 'utf-8')
        }
      },
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode.object']
          }
        }
      }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    const contractName = Object.keys(output.contracts['TestVerifier.sol'])[2]; // 3 contracts in the sol
    const bytecode = output.contracts['TestVerifier.sol'][contractName].evm.bytecode.object;
    const abi = output.contracts['TestVerifier.sol'][contractName].abi;

    // Deploy the contract using ethers
    const ContractFactory = new hardhat.ethers.ContractFactory(abi, bytecode, (await hardhat.ethers.getSigners())[0]);
    const contract = await ContractFactory.deploy();
    await contract.waitForDeployment();

    // Interaction with the contract
    strictEqual(await contract.verify(proofHex, [publicInputsHex]), true);

    // Cleanup S3
    await deleteS3Keys([
      pkgName + '/source.zip',
      pkgName + '/verifier.sol',
      pkgName + '/pkg.zip',
      pkgName + '/info.json',
    ]);
  });
});

