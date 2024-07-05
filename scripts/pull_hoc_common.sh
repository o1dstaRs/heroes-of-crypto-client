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

SRC_DIR="${ROOT_DIR}/game"
OUT_DIR="${SRC_DIR}/heroes-of-crypto-common"
GIT_FOLDER="${SRC_DIR}/heroes-of-crypto-common/.git"
NEED_CLONE=0

if [ -d $OUT_DIR ]
then
  echo "Directory ${OUT_DIR} exists"
  if [ ! -d $GIT_FOLDER ]; then
    echo "Directory ${OUT_DIR} is not a Git repository"
    rm -r "${OUT_DIR}"
    NEED_CLONE=1
  fi
else
  echo "Directory ${OUT_DIR} does not exist"
  NEED_CLONE=1
fi

if [ $NEED_CLONE -eq 1 ];
then
  cd "$SRC_DIR"
  git clone https://github.com/o1dstaRs/heroes-of-crypto-common.git
else
  cd "$OUT_DIR"
  git pull origin $1
fi
