#!/bin/bash
sh scripts/rpcs/start_all.sh $2
echo ""
echo "--------------------------------------------------------------------"
echo " Running all tests in \"test\" folder:"
echo "--------------------------------------------------------------------"

nyc mocha --require ts-node/register \
    --require source-map-support/register \
    --full-trace \
    --bail \
    --colors \
    --paths -p ./ test/*/*.ts test/*.ts

echo "--------------------------------------------------------------------"
echo ""
sh scripts/rpcs/stop_all.sh $2
echo ""