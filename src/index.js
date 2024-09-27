import {
  writeFileSync,
  statSync,
} from 'node:fs';
import {dirname, join} from 'node:path';
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

export default async function(event, { status }) {
  const nargoVersion = await execPromise(`nargo --version`);
  const bbVersion = await execPromise(`bb --version`);
  status.log(`Using nargo@${nargoVersion.stdout.split('\n')[0].split('= ')[1]}`);
  status.log(`Using bb@${bbVersion.stdout}`);

  const nargoToml = toml.parse(event.payload.nargoToml);
  const circuitName = nargoToml.package.name;
  const pkgName = uniqueName(circuitName);
  const dirPkg = join(tmpdir(), pkgName);
  const contractPath = join(dirPkg, 'target', 'contract.sol');
  mkdirpSync(dirPkg);

  writeFileSync(join(dirPkg, 'Nargo.toml'), event.payload.nargoToml);
  for(let file of event.payload.files) {
    mkdirpSync(dirname(join(dirPkg, file.filename)));
    writeFileSync(join(dirPkg, file.filename), file.content);
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
  await execPromise(`bb write_vk -b ./target/${circuitName}.json -o ./target/vk`, { cwd: dirPkg });
  await execPromise(`bb contract`, { cwd: dirPkg });

  status.log(`Storing build artifacts...`);
  await uploadLargeFileToS3(`build/${pkgName}/verifier.sol`, contractPath);
  await zipDirectory(dirPkg, dirPkg + '.zip');
  await uploadLargeFileToS3(`build/${pkgName}/pkg.zip`, dirPkg + '.zip');

  writeFileSync(join(dirPkg, 'info.json'), JSON.stringify({
    requestId: event.payload.requestId,
    pkgName,
    type: 'noir',
    nargoToml,
    soliditySize: statSync(contractPath).size,
    sourceSize: statSync(dirPkg + '-source.zip').size,
    pkgSize: statSync(dirPkg + '.zip').size,
  }, null, 2));
  await uploadLargeFileToS3(`build/${pkgName}/info.json`, join(dirPkg, 'info.json'));

  return pkgName;
}
