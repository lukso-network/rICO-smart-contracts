#!/bin/bash

moduleName="ethereum"
softwareName="ganache-cli"
PIDFile="scripts/TestRPCData/$moduleName.process.pid"
CurPID=$(<"$PIDFile")

if [[ "$1" != "use-existing" ]]; then
  kill -9 $CurPID
  echo "Killing existing $softwareName instance at pid $CurPID."
  echo "" > $PIDFile
else
  echo "Leaving $softwareName instance at pid $CurPID running."
fi
