/*
 * The deployer
 *
 * @author Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

class Whitelister {
   
    constructor(init, contract, address) {
        this.init = init;
        this.contract = contract;
        this.address = address;
        this.expect = this.init.helpers.expect;
    }

    async approve(address) {
        await this.callWhitelistMethod(address, true);
        this.expect( await this.contract.methods.isParticipantWhitelisted(address).call(), true, "Address should be whitelisted.");
    }

    async reject(address) {
        await this.callWhitelistMethod(address, false);
        this.expect( await this.contract.methods.isParticipantWhitelisted(address).call(), false, "Address should not be whitelisted.");
    }

    async callWhitelistMethod(address, mode) {
        return await this.contract.methods.whitelist([address], mode).send({ from: this.address });
    }
}

module.exports = Whitelister;