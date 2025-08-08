import {
  writeFileSync,
  statSync,
} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';

import {
  uploadLargeFileToS3,
  zipDirectory,
  mkdirpSync,
  monitorProcessMemory,
  execPromise,
  uniqueName,
} from 'circuitscan-pipeline-runner';
import toml from 'toml';

const DEFAULT_NARGO = "1.0.0-beta.9";
const VERSIONS = {
  "1.0.0-beta.9": "1.2.1",
  "1.0.0-beta.3": "0.84.0",
};

export default async function(event, { status }) {
  event.payload.nargoVersion = event.payload.nargoVersion || DEFAULT_NARGO;
  if(!VERSIONS.hasOwnProperty(event.payload.nargoVersion))
    throw new Error('invalid_nargo_version');
  const nargoVersionResult = await execPromise(`nargo --version`);
  const nargoVersion = nargoVersionResult.stdout.split('\n')[0].split('= ')[1];
  const bbVersion = await execPromise(`bb --version`);
  status.log(`Using nargo@${nargoVersion}`);
  status.log(`Using bb@${bbVersion.stdout}`);

  const nargoToml = toml.parse(event.payload.nargoToml);
  const circuitName = nargoToml.package.name;
  const pkgName = uniqueName(circuitName);
  const dirPkg = join(tmpdir(), pkgName);
  const contractPath = join(dirPkg, 'target', 'contract.sol');
  mkdirpSync(dirPkg);

  writeFileSync(join(dirPkg, 'Nargo.toml'), event.payload.nargoToml);
  for(let file of event.payload.files) {
    const filename = resolve(join(dirPkg, file.filename));
    if(filename.slice(0, dirPkg.length) !== dirPkg)
      throw new Error('invalid_filename');
    mkdirpSync(dirname(filename));
    writeFileSync(filename, file.content);
  }

  status.log(`Storing source zip...`);
  await zipDirectory(dirPkg, dirPkg + '-source.zip');
  await uploadLargeFileToS3(`build/${pkgName}/source.zip`, dirPkg + '-source.zip');

  status.log(`Compiling ${pkgName}...`);

  const compilePromise = execPromise(`nargo compile`, { cwd: dirPkg });
  const cancelMemoryMonitor = monitorProcessMemory(
    'nargo',
    10000,
    memoryUsage => {
      status.log(`Compiler memory usage`, { memoryUsage });
    }
  );
  await compilePromise;
  cancelMemoryMonitor();

  status.log(`Exporting Solidity contract...`);
  await execPromise(`bb write_vk -b ./target/${circuitName}.json -o ./target`, { cwd: dirPkg });
  await execPromise(`bb write_solidity_verifier -k ./target/vk -o ./target/contract.sol`, { cwd: dirPkg });

  status.log(`Storing build artifacts...`);
  await uploadLargeFileToS3(`build/${pkgName}/verifier.sol`, contractPath);
  await zipDirectory(dirPkg, dirPkg + '.zip');
  await uploadLargeFileToS3(`build/${pkgName}/pkg.zip`, dirPkg + '.zip');

  writeFileSync(join(dirPkg, 'info.json'), JSON.stringify({
    requestId: event.payload.requestId,
    pkgName,
    type: 'noir',
    nargoToml,
    nargoVersion,
    bbVersion: bbVersion.stdout,
    soliditySize: statSync(contractPath).size,
    sourceSize: statSync(dirPkg + '-source.zip').size,
    pkgSize: statSync(dirPkg + '.zip').size,
  }, null, 2));
  await uploadLargeFileToS3(`build/${pkgName}/info.json`, join(dirPkg, 'info.json'));

  // CLI resume looks for this message
  status.log(`Complete.`);

  return pkgName;
}
