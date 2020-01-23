#!/bin/bash
set -e

./scripts/rpcs/start_all.sh $2
echo ""
echo "--------------------------------------------------------------------"

if [[ "$1" = "all" ]]; then
  echo " Running all tests in \"test\" folder:"
else
  echo " Running tests in path \"$3\""
fi

echo "--------------------------------------------------------------------"
./node_modules/.bin/truffle compile

node test/run_js_validator_tests.js $1 $2 $3 $4

echo "--------------------------------------------------------------------"
echo ""
sh scripts/rpcs/stop_all.sh $2
echo ""
