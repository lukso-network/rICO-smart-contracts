#!/bin/bash
cd node_modules/wws-core.js/
if [[ "$1" == "start" ]]; then
    sh ./scripts/rpcs/start_all.sh
else
    sh ./scripts/rpcs/stop_all.sh
fi
