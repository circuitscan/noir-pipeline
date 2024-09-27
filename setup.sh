curl -Lo /tmp/noirup https://github.com/noir-lang/noirup/releases/latest/download/noirup
chmod +x /tmp/noirup
mv /tmp/noirup /usr/local/bin

curl -Lo /tmp/bbup https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/bbup
chmod +x /tmp/bbup
mv /tmp/bbup /usr/local/bin

apt install -y libc++-dev libc++abi-dev
