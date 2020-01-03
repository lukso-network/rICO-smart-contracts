/*
 * The test token tracker class.
 *
 * @author Micky Socaci <micky@nowlive.ro>, Fabian Vogelsteller <@frozeman>
*/

const { BN } = require("openzeppelin-test-helpers");

class BalanceContract {

    // set the defaults
    constructor() {
        this.balances = {};
    }

    set(_address, value) {
        this.balances[_address] = new BN(value.toString());
    }

    balanceOf(_address) {
        const balance = this.balances[_address];
        if (BN.isBN(balance)) {
            return balance;
        }
        return new BN("0");
    }

    transferWithFromAndTo(_from, _to, _amount) {
        _amount = new BN(_amount.toString());
        const senderBalance = this.balanceOf(_from);
        const receiverBalance = this.balanceOf(_to);
        if (senderBalance.gte(_amount)) {
            this.balances[_from] = senderBalance.sub(_amount);
            this.balances[_to] = receiverBalance.add(_amount);
        } else {
            throw ("[" + _from + "] has insufficient balance. \n balance: [" + this.balances[_from].toString() + "]\n amount: [" + _amount.toString() + "]");
        }
    }

    setTo(_address) {
        this._to = _address;
    }

    setFrom(_address) {
        this._from = _address;
    }

    transfer(_amount) {
        return this.transferWithFromAndTo(this._from, this._to, _amount);
    }



}

module.exports = BalanceContract;
