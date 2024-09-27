# Noir Compiler pipeline

Input a Noir circuit source and compiler configuration to generate (and upload to S3) zip of sources, Solidity verifier, and zip with build artifacts.

## Running tests

```sh
$ cp .env.example .env
# Update S3 configuration
$ vim .env
$ yarn test
```

## License

MIT
