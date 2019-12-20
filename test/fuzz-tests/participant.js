/*
 * The test participant class.
 *
 * @author Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

const Actor = require("./actorBase.js");

class Participant extends Actor {
    
    // set the defaults
    constructor(properties, ETH, extraETH) {
        super();

        this.properties = properties;
        this.helpers = properties.init.setup.helpers;
        this.expect = this.helpers.expect;
        this.address = this.properties.account.address;

        this.wallet = this.properties.wallet;
        this.extraETH = extraETH;
        this.txCosts = new helpers.BN(0);

        // should be add the tokenPrice?
        // and do the calculation based on the current token price?

        this.currentBalances = {
            ETH: ETH,
            Token: new this.helpers.BN("0"),
            withdrawableETH: new this.helpers.BN("0"),
            unlockedToken: new this.helpers.BN("0"),
        };

        this.expectedBalances = {
            ETH: ETH,
            Token: new this.helpers.BN("0"),
            withdrawableETH: new this.helpers.BN("0"),
            unlockedToken: new this.helpers.BN("0"),
        };
    }

    /* External */

    async getCurrentlyAvailableActions() {
        let actions = [];

        let canCommit = false;
        // is current block in contribution period ?
        const blockNumber = await this.rICO.methods.getCurrentBlockNumber().call();
        const commitPhaseStartBlock = this.startAndEndBlocks.commitPhaseStartBlock;
        const buyPhaseEndBlock = this.startAndEndBlocks.buyPhaseEndBlock;

        // are we in spending phase
        if( blockNumber >= commitPhaseStartBlock && blockNumber <= buyPhaseEndBlock ) {

            // do we have available ETH for spending ?
            if( this.currentBalances.ETH.gt( new helpers.BN("0") ) ) {
                canCommit = true;
            }
        }

        const cancelModes = await this.rICO.methods.getCancelModes(this.address).call();

        if(canCommit) {
            actions.push("commit");
        }

        if(cancelModes.byEth || cancelModes.byTokens) {
            actions.push("withdraw");
        }

        return actions;
    }

    // commit ETH to the rICO contract
    async commit(ETH) {
        // transfer to rICO
        await this.sendValueTx(ETH, this.helpers.addresses.Rico);

        // set expected
        this.expectedBalances.ETH = this.expectedBalances.ETH.sub(ETH);

        const isWhitelisted = await this.rICO.methods.isWhitelisted(this.address).call();
        
        if(isWhitelisted) {
            const tokenAmount = await this.helpers.utils.getTokenAmountForEthAtStage(
                this.helpers,
                this.rICO,
                ETH,
                await this.rICO.methods.getCurrentStage().call(),
            );
            this.expectedBalances.Token = this.expectedBalances.Token.add(tokenAmount);
        }
    }

    // withdraw ETH from the rICO contract
    async withdraw(TokenAmount = 0) {

        // calculation will max out at max available ETH and tokens that can be returned.
        // TokenAmount over max available will set calculation.returned_tokens
        const calculation = this.helpers.utils.getAvailableEthAndTokensForWithdraw(this.helpers, this.rICO, this.address, TokenAmount);

        this.expectedBalances.ETH = this.expectedBalances.ETH.add(calculation.eth);
        this.expectedBalances.Token = this.expectedBalances.Token.sub(calculation.withdrawn_tokens);
    }

    async updateAfterWhitelisting(tokenAmount) {
        this.expectedBalances.Token = this.expectedBalances.Token.add(tokenAmount);
    }

    async test() {
        await this.readBalances();
        this.sanityCheck();
    }

    displayBalances() {
        console.log("    address:                        ", this.address);
        console.log("    currentBalances.ETH:            ", this.toEth(this.currentBalances.ETH) + " eth");
        console.log("    currentBalances.withdrawableETH:", this.toEth(this.currentBalances.withdrawableETH) + " eth");
        console.log("    currentBalances.Token:          ", this.toEth(this.currentBalances.Token) + " tokens");
        console.log("    currentBalances.unlockedToken:  ", this.toEth(this.currentBalances.unlockedToken) + " tokens");
    }

    toEth(value) {
        return this.helpers.utils.toEth(this.helpers, value.toString())
    }

    /* Internal */

    async sendValueTx(value, to) {

        /*
            Maybe run a tx estimation, to make sure we can actually send value.
            
            const estimate = await helpers.web3Instance.eth.estimateGas({
                from: this.account,
                to: to,
                value: value
            });
            
        */

        const gasPrice = 1000000000; // 1 gwei
        const nonce = await helpers.web3Instance.eth.getTransactionCount(this.address);

        const signedSendValueTx = this.wallet.lightwallet.signing.signTx(
            this.wallet.keystore,
            this.properties.account.pwDerivedKey,
            this.wallet.lightwallet.txutils.valueTx({
                to: to,
                gasLimit: 500000,     // 500k gas
                gasPrice: gasPrice,
                value: value,
                nonce: nonce,
            }),
            this.address
        );

        const txResult = await helpers.web3Instance.eth.sendSignedTransaction(signedSendValueTx);
        
        if(!txResult.status) {
            console.log("Error sending value transaction to rICO contract.");
            console.log(txResult);
            process.exit(1);
        }

        this.txCosts = this.txCosts.add(
            new this.helpers.BN(txResult.gasUsed).mul(
                new this.helpers.BN(gasPrice)
            )
        );

    }

    // read balances from rICO and Token contract
    async readBalances() {
       
        const ActualEthBalance = await this.helpers.utils.getBalance(this.helpers, this.address);
       
        this.currentBalances.ETH = ActualEthBalance.sub( 
            this.extraETH.sub(this.txCosts)
        );

        this.currentBalances.Token = await this.rICOToken.methods.balanceOf(this.address).call();
        this.currentBalances.unlockedToken = await this.rICOToken.methods.getUnlockedBalance(this.address).call();

        const AvailableForWithdraw = await helpers.utils.getAvailableEthAndTokensForWithdraw(
            this.helpers,
            this.rICO,
            this.address,
            this.currentBalances.Token // full amount
        );

        this.currentBalances.withdrawableETH = AvailableForWithdraw.eth.toString();
    }

    // check if the expected and current balances match
    sanityCheck() {
        this.expect(this.expectedBalances.ETH.toString()).to.be.equal(this.currentBalances.ETH.toString(), 'ETH balance is not as expected.');
        this.expect(this.expectedBalances.Token.toString()).to.be.equal(this.currentBalances.Token.toString(), 'Token balance is not as expected.');
        this.expect(this.expectedBalances.withdrawableETH.toString()).to.be.equal(this.currentBalances.withdrawableETH.toString(), 'Withdrawable ETH balance is not as expected.');
        this.expect(this.expectedBalances.unlockedToken.toString()).to.be.equal(this.currentBalances.unlockedToken.toString(), 'Unlocked Token balance is not as expected.');
    }

    /* Getters */

    get rICO() {
        return this.properties.init.deployment.contracts.rICO;
    }

    get rICOToken() {
        return this.properties.init.deployment.contracts.rICOToken;
    }

    get startAndEndBlocks() {
        return this.properties.init.deployment.cache;
    }
}

module.exports = Participant;
