NARGO_VERSION=`node -e "process.stdout.write(require('../event.json').nargoVersion)"`
BBUP_VERSION=`node -e "process.stdout.write(require('../event.json').bbupVersion)"`

curl -Lo ./nargo.tar.gz https://github.com/noir-lang/noir/releases/download/v$NARGO_VERSION/nargo-x86_64-unknown-linux-gnu.tar.gz
tar -xvzf nargo.tar.gz
chmod +x ./nargo
mv ./nargo /usr/local/bin

curl -Lo ./bbup.tar.gz https://github.com/AztecProtocol/aztec-packages/releases/download/aztec-packages-v$BBUP_VERSION/barretenberg-x86_64-linux-gnu.tar.gz
tar -xvzf bbup.tar.gz
chmod +x ./bb
mv ./bb /usr/local/bin

apt install -y libc++-dev libc++abi-dev
