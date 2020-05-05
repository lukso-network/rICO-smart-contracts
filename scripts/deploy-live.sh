#!/bin/bash
set -e
./scripts/rpcs/start_all.sh $2

./node_modules/.bin/truffle compile

node deployment/1_deploy_contracts.js live
