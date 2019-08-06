#!/usr/bin/env bash

DIST="./dist"
mkdir -p "${DIST}"
cp -R ./src package.json "${DIST}/"
if [[ -f "${AUX_PREPARE_SCRIPT}" ]]; then
  "${AUX_PREPARE_SCRIPT}" "${DIST}/"
fi