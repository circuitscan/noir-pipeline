NARGO_VERSION=`node -e "process.stdout.write(require('../event.json').nargoVersion)"`
export BBUP_VERSION=`node -e "process.stdout.write(require('../event.json').bbupVersion)"`

curl -Lo ./nargo.tar.gz https://github.com/noir-lang/noir/releases/download/v$NARGO_VERSION/nargo-x86_64-unknown-linux-gnu.tar.gz
tar -xvzf nargo.tar.gz
chmod +x ./nargo
mv ./nargo /usr/local/bin

dnf install docker -y
systemctl start docker

bb55() {
  docker run --rm  -v "$(pwd)":/app -w /app "numtel/barretenberg:0.55.0" bb "$@"
}
export -f bb55
bb47() {
  docker run --rm  -v "$(pwd)":/app -w /app "numtel/barretenberg:0.47.1" bb "$@"
}
export -f bb47
bb46() {
  docker run --rm  -v "$(pwd)":/app -w /app "numtel/barretenberg:0.46.1" bb "$@"
}
export -f bb46
bb41() {
  docker run --rm  -v "$(pwd)":/app -w /app "numtel/barretenberg:0.41.0" bb "$@"
}
export -f bb41
bb() {
  if [ "$BBUP_VERSION" == "0.47.1" ]; then
    bb47 "$@"
  elif [ "$BBUP_VERSION" == "0.46.1" ]; then
    bb46 "$@"
  elif [ "$BBUP_VERSION" == "0.41.0" ]; then
    bb41 "$@"
  elif [ "$BBUP_VERSION" == "0.55.0" ]; then
    bb55 "$@"
  else
    echo "Unsupported BBUP_VERSION: $BBUP_VERSION"
  fi
}
export -f bb
