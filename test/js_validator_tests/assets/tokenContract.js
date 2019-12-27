/*
 * The test token tracker class.
 *
 * @author Micky Socaci <micky@nowlive.ro>, Fabian Vogelsteller <@frozeman>
*/

const { BN, web3, constants } = require("openzeppelin-test-helpers");

class TokenContract {

    // set the defaults
    constructor(_initialSupply, _deployerAddress) {
        this.balances = [];
        this.balances[_deployerAddress] = new BN(_initialSupply);
    }

    balanceOf(_address) {
        const balance = this.balances[_address];
        if(BN.isBN(balance)) {
            return balance;
        }
        return new BN("0");
    }

    send(_from, _to, newTokenAmount, data = null) {
        newTokenAmount = new BN(newTokenAmount.toString());
        const senderBalance = this.balanceOf(_from);
        const receiverBalance = this.balanceOf(_to);
        if(senderBalance.gte(newTokenAmount)) {
            this.balances[_from] = senderBalance.sub(newTokenAmount);
            this.balances[_to] = receiverBalance.add(newTokenAmount);
        }
    }

}

module.exports = TokenContract;
