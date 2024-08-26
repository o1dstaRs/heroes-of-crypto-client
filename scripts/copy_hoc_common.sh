#!/usr/bin/env bash

# Make sure that git is installed on the system
git --version 2>&1 >/dev/null
GIT_IS_AVAILABLE=$?

if [ $GIT_IS_AVAILABLE -ne 0 ]; then
  echo "Git is not installed!"
  exit $GIT_IS_AVAILABLE
fi

# Root directory of app
ROOT_DIR=$(git rev-parse --show-toplevel)
GAME_DIR="${ROOT_DIR}/game"
DEST_DIR="${GAME_DIR}/heroes-of-crypto-common"

if [ -d $DEST_DIR ]
then
  echo "Directory ${DEST_DIR} exists"
  exit 0
else
  echo "Copying ${ROOT_DIR}/../heroes-of-crypto-common into ${GAME_DIR}"
  cp -r "${ROOT_DIR}/../heroes-of-crypto-common" $GAME_DIR
  rm -rf "${DEST_DIR}/node_modules"
fi

cat > "${DEST_DIR}/tsconfig.json" << EOL
{
    "extends": "../../tsconfig.json",
    "compilerOptions": {
        "outDir": "dist",
        "skipLibCheck": true,
        "esModuleInterop": true
    },
    "include": ["src/**/*", "src/generated/protobuf/v1/*"]
}
EOL
