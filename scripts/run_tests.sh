#!/bin/bash
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

node test/run_tests.js $1 $2 $3 $4

#if [[ "$1" = "all" ]]; then
#  ./node_modules/.bin/truffle test --network development
#else
#  ./node_modules/.bin/truffle test $3 --network development 
#fi

echo "--------------------------------------------------------------------"
echo ""
sh scripts/rpcs/stop_all.sh $2
echo ""
