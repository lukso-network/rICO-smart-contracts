#!/bin/bash
tsc --declaration true --emitDeclarationOnly --declarationDir dist/types

# due to some bug or bad import we need to replace all src/core/transaction
# imports from the results to the proper path

find dist/types -type f -print0 | xargs -0 sed -i 's/src\/core\/transaction/\.\/transaction/g'
