function assertError(block, error, s, message) {
    
    let code = error.message.search(message);
    if(code == -1) {
        console.log("----------------------------------------------------------------");
        console.log("BLOCK: ---------------------------------------------------------");
        console.log(block.toString());
        console.log("ERROR: ---------------------------------------------------------");
        console.log(error);
        console.log("Expected: ------------------------------------------------------");
        console.log(message);
        console.log("Received: ------------------------------------------------------");
        console.log(error.message);
        console.log("----------------------------------------------------------------");
    }
    
    // assert.isAbove(error.message.search(message), -1, message);

    assert.include(error.message, message, 'Error');

    // for some reason account nonceCache does not properly refresh
    // after a revert happens.. so we clear it.
    helpers.utils.resetAccountNonceCache(helpers);
}

async function assertThrows(block, message, errorCode) {
    try {
        await block();
    } catch (e) {
        return assertError(block, e, errorCode, message);
    }

    console.log();
    console.log("Assert failed: ");
    console.log("block:", block);
    console.log("message:", message);

    assert.fail('should have thrown before');
}

module.exports = {
    async assertJump(block, message = 'should have failed with invalid JUMP') {
        return assertThrows(block, message, 'invalid JUMP')
    },
    async assertInvalidOpcode(block, message = 'should have failed with invalid opcode') {
        return assertThrows(block, message, 'revert')
    },
    async assertOpcode(block, message = 'should have failed with invalid opcode') {
        return assertThrows(block, message, 'invalid opcode')
    }
};

