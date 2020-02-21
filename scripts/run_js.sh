#!/bin/bash
# set -e

./scripts/rpcs/start_all.sh $2
echo ""
echo "--------------------------------------------------------------------"

echo " Running all tests in \"test/js_validator_tests\" folder:"

echo "--------------------------------------------------------------------"

node test/run_js_validator_tests.js $1 $2 $3 $4

echo "--------------------------------------------------------------------"
echo ""
sh scripts/rpcs/stop_all.sh $2
echo ""