/*
 * The test project class.
 *
 * @author Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const Actor = require("./actorBase.js");

class Project extends Actor {
   
    constructor(init, contract, address) {
        super();

        this.init = init;
        this.helpers = init.setup.helpers;
        this.contract = contract;
        this.address = address;
        this.expect = this.init.helpers.expect;
        this.txCosts = new this.helpers.BN(0);

        this.actionLog = [];

        this.currentBalances = {
            ETH: new this.helpers.BN("0"),
            withdrawableETH: new this.helpers.BN("0"),
        };

        this.expectedBalances = {
            ETH: new this.helpers.BN("0"),
            withdrawableETH: new this.helpers.BN("0"),
        };
    }

    async withdrawFullAmount(cb = null) {
        await this.readBalances();
        // console.log("withdrawFullAmount before");
        this.displayBalances();
        
        // const ethval = new this.helpers.BN("50000000000000000000"); // this.currentBalances.withdrawableETH
        const ethval = this.currentBalances.withdrawableETH
      

        await this.withdraw( ethval );
        if(cb) {
            await cb();
        }
        // console.log("withdrawFullAmount after");
        // this.displayBalances();
        await this.test();
    }

    async withdrawHalf(cb) {
        await this.readBalances();
        await this.withdraw( this.currentBalances.withdrawableETH.div( new this.helpers.BN(2) ) );

        await cb();
        
        await this.test();
    }

    async withdraw(amount) {
        
        console.log("withdraw:", this.toEth(amount) + " eth");

        this.actionLog.push( { type:"withdraw", "value": amount, valid: null } );

        // await this.readBalances();
        // console.log(" > currentBalances.ETH:              ", this.toEth(this.currentBalances.ETH) + " eth");
        // console.log(" > currentBalances.withdrawableETH:  ", this.toEth(this.currentBalances.withdrawableETH) + " eth");
        
        const gasPrice = 1000000000; // 1 gwei

        const txResult = await this.contract.methods.projectWithdraw(amount.toString()).send({
            from: this.address,
            gasLimit: 500000,     // 500k gas
            gasPrice: gasPrice,
        });
        
        const gasCost = new this.helpers.BN(txResult.gasUsed).mul(
            new this.helpers.BN(gasPrice)
        )
        
        this.expectedBalances.ETH = this.currentBalances.ETH.add( 
            amount.sub(gasCost)
        );
        this.expectedBalances.withdrawableETH = this.currentBalances.withdrawableETH.sub(amount);

        // console.log(" > expectedBalances.ETH:             ", this.toEth(this.expectedBalances.ETH) + " eth");
        // console.log(" > expectedBalances.withdrawableETH: ", this.toEth(this.expectedBalances.withdrawableETH) + " eth");
        
    }

    async getAvailableActions() {
        let actions = [];

        const getProjectAvailableEth = new this.helpers.BN( await this.contract.methods.getProjectAvailableEth().call() );
        if(getProjectAvailableEth.gt( new this.helpers.BN("0") )) {
            actions.push("withdrawFullAmount");
            actions.push("withdrawHalf");
        }

        return actions;
    }

    async executeRandomActionOrNone() {
        const availableActions = ["nothing", ...await this.getAvailableActions()];
        const rand = Math.floor( Math.random() * availableActions.length );
        const action = availableActions[rand];
        console.log("Project Wallet", "Executing:", action, " / Available:", availableActions);

        // action execution
        switch(action) {
            case "withdrawFullAmount":
                await this.withdrawFullAmount();
                break;
            case "withdrawHalf":
                await this.withdrawHalf();
                break;
            case "nothing":
                this.actionLog.push( { type:"nothing", "value": null, valid: null } );
                break;
            default:
                throw("error at executeRandomActionOrNone: action[" + action + "] not found.");
        }

        if(action !== "nothing") {
            await this.test();
        }

    }

    // check if the expected and current balances match
    async test() {
        await this.readBalances();
        expect(this.currentBalances.ETH.toString()).to.be.equal(this.expectedBalances.ETH.toString(), 'ETH balance is not as expected.');
        expect(this.currentBalances.withdrawableETH.toString()).to.be.equal(this.expectedBalances.withdrawableETH.toString(), 'Withdrawable ETH is not as expected.');

        // get last item and set to valid
        const item = this.actionLog[ this.actionLog.length - 1 ];
        item.valid = true;
        
    }

    // read balances from rICO and Token contract
    async readBalances() {
        const getProjectAvailableEth = await this.contract.methods.getProjectAvailableEth().call() 
        this.currentBalances.ETH = await this.helpers.utils.getBalance(this.helpers, this.address);
        this.currentBalances.withdrawableETH = new this.helpers.BN( getProjectAvailableEth );
    }
    
    displayBalances() {
        console.log("    address:                         ", this.address);
        console.log("    currentBalances.ETH:             ", this.toEth(this.currentBalances.ETH) + " eth");
        console.log("    currentBalances.withdrawableETH: ", this.toEth(this.currentBalances.withdrawableETH) + " eth");
    }

}

module.exports = Project;



/*
class Project extends Actor {
    // set the defaults
    constructor() {

        this.currentBalances = {
            ETH: 0,
            widthdrawCount: 0
        }

        this.expectedBalances = {
            ETH: ETH,
            widthdrawCount: 0
        }
    }

    // withdraw ETH from the rICO contract
    withdraw(ETH) {

    }

    // white list any number of addresses
    whitelist(addresses) {

    }

    test() {
        this.readBalances();
        this.recalculateExpectedBalances();

        this.sanityCheck();
    }

    // read balances from rICO and Token contract
    readBalances() {

        // set all values new
        // this.currentBalances.ETH = ...;
        // ...
    }

    // recalculate expected balances
    recalculateExpectedBalances() {
        // ...
        // this.expectedBalances.ETH = ...;
    }

    // check if the expected and current balances match
    sanityCheck() {
        expect(this.expectedBalances.ETH).to.be.equal(this.currentBalances.ETH, 'ETH balance is not as expected.');
        expect(this.expectedBalances.widthdrawCount).to.be.equal(this.currentBalances.widthdrawCount, 'Widthdraw Count is not as expected.');
    }
}
*/