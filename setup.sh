NARGO_VERSION=`node -e "process.stdout.write(require('../event.json').nargoVersion || '')"`

curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash
source ~/.bashrc

# Check if NARGO_VERSION is empty
if [ -z "$NARGO_VERSION" ]; then
    # Run noirup without the -v argument
    noirup
else
    # Run noirup with the specified version
    noirup -v $NARGO_VERSION
fi

NARGO_VERSION=$(nargo --version | grep 'nargo version' | awk -F '= ' '{print $2}')

# Convert nargo version to bb version using a mapping
# https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/cpp/src/barretenberg/bb/readme.md#version-compatibility-with-noir
declare -A VERSION_MAP=(
    ["0.34.0"]="0.55.0"
    ["0.33.0"]="0.47.1"
    ["0.32.0"]="0.46.1"
    ["0.31.0"]="0.41.0"
)

BB_VERSION=${VERSION_MAP[$NARGO_VERSION]}

# Check if BB_VERSION was found
if [ -z "$BB_VERSION" ]; then
    echo "Unknown Nargo version $NARGO_VERSION"
    exit 1
fi

# Install the corresponding barretenberg version
bbup -v $BB_VERSION

# For good measure
source ~/.bashrc
