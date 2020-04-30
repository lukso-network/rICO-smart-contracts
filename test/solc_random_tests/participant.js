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

        this.block = 0;

        this.properties = properties;
        this.helpers = properties.init.setup.helpers;
        this.expect = this.helpers.expect;
        this.address = this.properties.account.address;

        this.wallet = this.properties.wallet;
        this.extraETH = extraETH;
        this.txCosts = new BN(0);

        this.actionLog = [];

        // should be add the tokenPrice?
        // and do the calculation based on the current token price?

        this.currentBalances = {
            ETH: ETH,
            Token: new BN("0"),
            withdrawableETH: new BN("0"),
            unlockedToken: new BN("0"),
            pendingTokens: new BN("0"),
            // allocatedETH: new BN("0"),
        };

        this.expectedBalances = {
            ETH: ETH,
            Token: new BN("0"),
            withdrawableETH: new BN("0"),
            unlockedToken: new BN("0"),
            pendingTokens: new BN("0"),
        };

        this.whitelisted = false;
    }

    /* External */

    setBlock(block) {
        this.block = block;
    }

    availableScenarios() {

        /*
        1. Participant: Commit ETH + do nothing forever
        2. Participant: Commit ETH + send 0 value tx
        3. Participant: Commit ETH + project calls "cancel"
        4. Participant: Commit ETH + project whitelists + do nothing forever
        5. Participant: Commit ETH + project whitelists + send n tokens back + do nothing forever
        6. Participant: Commit ETH + project whitelists + send n tokens back + commit again
        7. Participant: Commit ETH + project whitelists + send all tokens back + do nothing forever
        8. Participant: Commit ETH + project whitelists + send all tokens back
        9. Participant: Commit ETH + project whitelists + commit again n times + refund x times (randomize both actions?)
        10. Participant Commit ETH + project whitelist + move unlocked tokens + refund
        11. Participant Commit ETH + project whitelist + move unlocked tokens + refund + refund x times
        12. Project: call withdraw n times
        */
        
        const FirstStage = Math.round(Math.rand() * 12);

        return [
            { 
                title: "Participant: Commit ETH + do nothing forever", actions: [
                    { action: "commitEntireBalance", stage: FirstStage },
                ]
            },
            { 
                title: "Participant: Commit ETH + send 0 value tx ( cancel )", actions: [
                    { action: "commitEntireBalance", stage: FirstStage },
                    { action: "withdrawByETH", stage: FirstStage + 1 },
                ]
            },
            { 
                title: "Participant: Commit ETH + send 0 value tx ( cancel )", actions: [
                    { action: "commitEntireBalance", stage: FirstStage },
                    { action: "withdrawByETH", stage: 0 },
                ]
            }
        ]
    }

    pickScenario() {

    }

    async getAvailableActions() {
        let actions = [];

        let canCommit = false;

        const commitPhaseStartBlock = this.startAndEndBlocks.commitPhaseStartBlock;
        const buyPhaseEndBlock = this.startAndEndBlocks.buyPhaseEndBlock;

        // are we in spending phase
        if( this.block >= commitPhaseStartBlock && this.block <= buyPhaseEndBlock ) {
            // do we have available ETH for spending ?
            if( this.currentBalances.ETH.gt( new BN("0") ) ) {
                canCommit = true;
            }
        }

        const partici = await this.rICO.methods.participants(this.address).call();

        if(canCommit) {
            actions.push("commitEntireBalance");
            actions.push("commitHalfBalance");
        }

        if(partici.pendingETH > 0) {
            actions.push("withdrawByETH");
            // actions.push("withdrawByETH_half"); // only full eth withdraw available.
        }

        if(partici.committedETH > 0) {
            actions.push("sendAllTokensBack");
            actions.push("sendHalfTokensBack");
        }

        if(this.whitelisted === false) {
            actions.push("whitelistApprove");
        } else {
            // if()
            actions.push("whitelistDeny");
        }

        return actions;
    }

    async getAvailableActionsWithNone() {
        return ["nothing", ...await this.getAvailableActions()];
    }
    
    async executeRandomActionOrNone(callback = null) {
        const availableActions = await this.getAvailableActionsWithNone();
        const rand = Math.floor( Math.random() * availableActions.length );
        await this.executeAction(availableActions[rand], callback);
    }

    async executeAction(action, callback = null) {
        const availableActions = await this.getAvailableActionsWithNone();

        console.log(this.address, "Executing:", action, " / Available:", availableActions);

        // action execution
        switch(action) {
            case "commitEntireBalance":
                await this.commitEntireBalance();
                break;
            case "commitHalfBalance":
                await this.commitHalfBalance();
                break;
            case "withdrawByETH":
                await this.withdrawByETH();
                break;
            case "sendAllTokensBack":
                await this.sendAllTokensBack();
                break;
            case "sendHalfTokensBack":
                await this.sendHalfTokensBack();
                break;
            case "whitelistApprove":
                await this.whitelistApprove();
                break;
            case "whitelistDeny":
                await this.whitelistDeny();
                break;
            case "nothing":
                this.actionLog.push( { type:"nothing", "value": null, valid: null } );
                if(callback) {
                    await callback();
                }
                // do nothing
                return;
                break;
            default:
                throw("error at executeAction: action[" + action + "] not found.");
        }

        if(callback) {
            await callback();
        }        
        await this.test();

    }

    async commitEntireBalance() {
        await this.readBalances();
        const amount = this.currentBalances.ETH;
        this.actionLog.push( { type:"commitEntireBalance", "value": amount, valid: null } );
        await this.commit( amount );
    }

    async commitHalfBalance() {
        await this.readBalances();
        const amount = this.currentBalances.ETH.divRound( new BN(2) );
        this.actionLog.push( { type:"commitHalfBalance", "value": amount, valid: null } );
        await this.commit( amount );
    }

    // commit ETH to the rICO contract
    async commit(ETH) {

        // transfer to rICO
        await this.sendValueTx(ETH, this.helpers.addresses.Rico);
        
        const currentStage = await this.rICO.methods.getCurrentStage().call();
        const tokenAmount = await this.helpers.utils.getTokenAmountForEthAtStage(
            this.helpers,
            this.rICO,
            ETH,
            currentStage,
        );

        // contract processes and returns overflow amount
        const maxAcceptableValue = new BN( await this.rICO.methods.committableEthAtStage(currentStage).call() );
        let acceptedValue ;

        if(ETH.gt(maxAcceptableValue)) {
            acceptedValue = maxAcceptableValue;
        } else {
            acceptedValue = ETH;
        }

        // const unlockPercentage = this.getCurrentGlobalUnlockRatio();
        const unlockPercentage = new BN(await this.getMyUnlockRatio());

        const partici = await this.rICO.methods.participants(this.address).call();
        if(partici.whitelisted) {

            this.expectedBalances.ETH = this.currentBalances.ETH.sub(acceptedValue) ;

            const price = await this.rICO.methods.getCurrentPrice().call();
           
            // token balance now includes reserved tokens for accepted amount 
            this.expectedBalances.Token = this.currentBalances.Token.add(
                this.helpers.utils.getTokenAmountForEthAtValue(this.helpers, acceptedValue, price)
            );

            // this.expectedBalances.pendingTokens = new BN(0);


            let withdrawableETHCalc = acceptedValue;
            if(unlockPercentage.gt(new BN("0"))) {
                // adjust by unlockPercentage
                withdrawableETHCalc = withdrawableETHCalc.sub(
                    withdrawableETHCalc.mul(unlockPercentage).divRound(
                        new BN("10").pow( new BN(20) )
                    )
                )
            }
            this.expectedBalances.withdrawableETH = this.currentBalances.withdrawableETH.add(withdrawableETHCalc);

        } else {

            // contract accepts full sent value
            this.expectedBalances.ETH = this.currentBalances.ETH.sub(ETH);

            this.expectedBalances.withdrawableETH = this.currentBalances.withdrawableETH;
            // this.expectedBalances.pendingTokens = this.currentBalances.pendingTokens.add(tokenAmount);
        }

        if(unlockPercentage.gt(new BN("0"))) {
            this.expectedBalances.unlockedToken = this.expectedBalances.Token.mul(unlockPercentage).divRound(
                new BN("10").pow( new BN(20) )
            )
        } else {
            this.expectedBalances.unlockedToken = new BN("0");
        }

        // console.log("this.expectedBalances.unlockedToken", this.toEth(this.expectedBalances.unlockedToken), "tokens");
        // console.log("unlockPercentage                   ", this.toEth(unlockPercentage), "%");
        
        // const unlockedTokenBalance = await this.rICOToken.methods.getUnlockedBalance(this.address).call();
        // console.log("unlockedTokenBalance               ", this.toEth(unlockedTokenBalance), "tokens");
        
        // const balanceOf = await this.rICOToken.methods.balanceOf(this.address).call();
        // console.log("balanceOf                          ", this.toEth(balanceOf), "tokens");

        // const getLockedBalance = await this.rICOToken.methods.getLockedBalance(this.address).call();
        // console.log("getLockedBalance                   ", this.toEth(getLockedBalance), "tokens");


        // const getParticipantReservedTokens = await this.rICO.methods.getParticipantReservedTokens(this.address).call();
        // console.log("getParticipantReservedTokens               ", this.toEth(getParticipantReservedTokens), "tokens");
        

        // const aggregatedStats = await this.rICO.methods.participantAggregatedStats(this.address).call(); 

        // console.log("aggregatedStats.unlockedTokens       ", this.toEth(aggregatedStats.unlockedTokens), "tokens");
        // console.log("aggregatedStats.returnedTokens     ", this.toEth(aggregatedStats.returnedTokens), "tokens");
        // console.log("aggregatedStats.pendingTokens     ", this.toEth(aggregatedStats.pendingTokens), "tokens");

        // const stages0 = await this.rICO.methods.getParticipantDetailsByStage(this.address, 0).call();
        // const stages1 = await this.rICO.methods.getParticipantDetailsByStage(this.address, 1).call();

        // console.log("stages0.unlockedTokens              ", this.toEth(stages0.stageunlockedTokens), "tokens");
        // console.log("stages0.returnedTokens            ", this.toEth(stages0.stageReturnedTokens), "tokens");
        // console.log("stages0.pendingTokens            ", this.toEth(stages0.stagePendingTokens), "tokens");

        // console.log("stages1.unlockedTokens              ", this.toEth(stages1.stageunlockedTokens), "tokens");
        // console.log("stages1.returnedTokens            ", this.toEth(stages1.stageReturnedTokens), "tokens");
        // console.log("stages1.pendingTokens            ", this.toEth(stages1.stagePendingTokens), "tokens");


        // const blockNumber = await this.rICO.methods.getCurrentEffectiveBlockNumber().call();

        // const getParticipantReservedTokens = await this.rICO.methods.getParticipantReservedTokens(this.address).call();
        // console.log("getParticipantReservedTokens        ", this.toEth(getParticipantReservedTokens), "tokens");

        


    }

    // withdraw ETH from the rICO contract by sending 0 value or value lower than minContribution transaction
    async withdrawByETH() {

        const participantRecord = await this.getParticipantRecord();
        const pendingEth = participantRecord.totalSentETH
            .sub(participantRecord.returnedETH)
            .sub(participantRecord.committedETH);
        
        // expected balance includes value stored in contract that has not been procesed.
        this.expectedBalances.ETH = this.currentBalances.ETH.add(pendingEth);
        
        // reserved tokens are set to 0
        // this.expectedBalances.pendingTokens = new BN("0");
        
        // token balance does not change
        this.expectedBalances.Token = this.currentBalances.Token;

        this.actionLog.push( { type:"withdrawByETH", "value": pendingEth, valid: null } );

        // send 0 value or minContribution value transaction in order to withdraw "by eth"
        await this.sendValueTx(0, this.helpers.addresses.Rico);

    }

    async sendAllTokensBack() {
        await this.readBalances();
        this.actionLog.push( { type:"sendAllTokensBack", "value": this.currentBalances.Token, valid: null } );
        return await this.withdrawByToken(this.currentBalances.Token);
    }

    async sendHalfTokensBack() {
        await this.readBalances();
        // send half the locked token balance back
        const value = this.currentBalances.Token.sub(this.currentBalances.unlockedToken).divRound( new BN(2) );
        this.actionLog.push( { type:"sendHalfTokensBack", "value": value, valid: null } );
        return await this.withdrawByToken(value);
    }

    async whitelistApprove() {
        this.actionLog.push( { type:"whitelistApprove", "value": null, valid: null } );
        return await this.setWhitelist(true);
    }

    async whitelistDeny() {
        this.actionLog.push( { type:"whitelistDeny", "value": null, valid: null } );
        return await this.setWhitelist(false);
    }

    async setWhitelist(mode) {
        this.whitelisted = mode;
        await this.readBalances();

        // reserved tokens are set to 0
        // this.expectedBalances.pendingTokens = new BN("0");

        const participantRecord = await this.getParticipantRecord();

        if(mode === true) {
            // accept contribution
            await this.whitelister.approve(this.address);
        } else {
            await this.whitelister.reject(this.address);
        }


        const currentStage = await this.rICO.methods.getCurrentStage().call();
        const maxAcceptableValue = new BN( await this.rICO.methods.committableEthAtStage(currentStage).call() );

        let acceptedValue ;

        const claimableEth = participantRecord.committedETH.add(participantRecord.pendingETH);

        if(claimableEth.gt(maxAcceptableValue)) {
            acceptedValue = maxAcceptableValue;
        } else {
            acceptedValue = claimableEth;
        }

        const price = await this.rICO.methods.getCurrentPrice().call();
        const unlockPercentage = this.getCurrentGlobalUnlockRatio();

        if(mode === true) {

            this.expectedBalances.ETH = this.currentBalances.ETH.add(claimableEth.sub(acceptedValue)); 

            // token balance now includes reserved tokens for accepted amount 
            this.expectedBalances.Token = this.currentBalances.Token.add(
                this.helpers.utils.getTokenAmountForEthAtValue(this.helpers, acceptedValue, price)
            );

            if(unlockPercentage.gt(new BN("0"))) {
    
                this.expectedBalances.withdrawableETH = this.currentBalances.withdrawableETH.add(
                    acceptedValue.sub(
                        // divRound must be used here otherwise result will not be floored like solidity does.
                        acceptedValue.mul(unlockPercentage).divRound(
                            new BN("10").pow( new BN(20) )
                        )
                    )
                );
    
                // this.expectedBalances.unlockedToken = this.expectedBalances.Token.mul(unlockPercentage).divRound(
                //     new BN("10").pow( new BN(20) )
                // )
                
                this.expectedBalances.unlockedToken = false;
                
                // console.log("accept > unlockedToken:    ", this.expectedBalances.unlockedToken.toString() );
            } else {
                this.expectedBalances.withdrawableETH = this.currentBalances.withdrawableETH.add(acceptedValue);
                this.expectedBalances.unlockedToken = new BN("0");
            }


        } else {
            
            this.expectedBalances.ETH = this.currentBalances.ETH.add(claimableEth); 

            // token balance does not change
            this.expectedBalances.Token = this.currentBalances.Token;

            // this.expectedBalances.withdrawableETH
            // is 0 since participant can only "cancel full amount"
            // but we also test against "token" value


            if(unlockPercentage.gt(new BN("0"))) {
    
                this.expectedBalances.unlockedToken = this.expectedBalances.Token.mul(unlockPercentage).divRound(
                    new BN("10").pow( new BN(20) )
                )

                const reservedTokens = this.expectedBalances.Token.sub(this.expectedBalances.unlockedToken);
                const calculation = await this.getAvailableEthAndTokensForWithdraw();
                this.expectedBalances.withdrawableETH = calculation.eth; // this.currentBalances.withdrawableETH.add(calculation.eth);


            } else {
                this.expectedBalances.unlockedToken = new BN("0");

                const calculation = await this.getAvailableEthAndTokensForWithdraw();
                this.expectedBalances.withdrawableETH = calculation.eth; // this.currentBalances.withdrawableETH.add(calculation.eth);
            }
        }
        
        // console.log("this.expectedBalances.withdrawableETH", this.toEth(this.expectedBalances.withdrawableETH));
        // this.expectedBalances.pendingTokens = new BN(0);
        await this.readBalances();
    }
    

    // withdraw ETH from the rICO contract by sending tokens back
    async withdrawByToken(TokenAmount = null) {
        // calculation will max out at max available ETH and tokens that can be returned.
        // TokenAmount over max available will set calculation.returned_tokens
        const calculation = await this.getAvailableEthAndTokensForWithdraw(TokenAmount);

        this.expectedBalances.ETH = this.currentBalances.ETH.add(calculation.eth);
        this.expectedBalances.withdrawableETH = this.currentBalances.withdrawableETH.sub(calculation.eth);  
        this.expectedBalances.Token = this.currentBalances.Token.sub(calculation.withdrawn_tokens);

        const maxcalculation = await this.getAvailableEthAndTokensForWithdraw();
        // this.expectedBalances.unlockedToken = false;
        this.expectedBalances.unlockedToken = this.currentBalances.Token.sub(maxcalculation.withdrawn_tokens);

        await this.sendTokenTx(TokenAmount, this.helpers.addresses.Rico);
    }

    async updateAfterWhitelisting(tokenAmount) {
        this.expectedBalances.Token = this.expectedBalances.Token.add(tokenAmount);
    }

    async displayDebugBalances() {
        console.log("");
        await this.readBalances();
        await this.displayRecord();
        this.displayBalances();
        this.displayExpectedBalances();
    }

    async displayBalances() {
        console.log("");
        await this.readBalances();
        await this.displayRecord();
        this.displayBalances();
    }

    async displayRecord() {
        const record = await this.getParticipantRecord();

        // const aggregatedStats = await this.rICO.methods.participantAggregatedStats(this.address).call(); 
        console.log("    User Record:             ", this.address);
        console.log("      committedEth:          ", this.toEth(record.committedETH) + " eth");
        console.log("      pendingEth:            ", this.toEth(record.pendingETH) + " eth");
        console.log("      reservedTokens:   ", this.toEth(record.reservedTokens) + " tokens");
        console.log("      _unlockedTokens:   ", this.toEth(record._unlockedTokens) + " tokens");
        console.log("      _currentReservedTokens: ", this.toEth(record._currentReservedTokens) + " tokens");
        console.log("      lastBlock:             ", record._lastBlock.toString());

    }

    displayBalances() {
        console.log("    User Wallet Balances:              ", this.address);
        console.log("      currentBalances.ETH:             ", this.toEth(this.currentBalances.ETH) + " eth");
        console.log("      currentBalances.withdrawableETH: ", this.toEth(this.currentBalances.withdrawableETH) + " eth");
        console.log("      currentBalances.Token:           ", this.toEth(this.currentBalances.Token) + " tokens");
        console.log("      currentBalances.unlockedToken:   ", this.toEth(this.currentBalances.unlockedToken) + " tokens");
    }

    displayExpectedBalances() {
        console.log("    expected:                          ", this.address);
        console.log("      expectedBalances.ETH:            ", this.toEth(this.expectedBalances.ETH) + " eth");
        console.log("      expectedBalances.withdrawableETH:", this.toEth(this.expectedBalances.withdrawableETH) + " eth");
        console.log("      expectedBalances.Token:          ", this.toEth(this.expectedBalances.Token) + " tokens");
        if(this.expectedBalances.unlockedToken.toString()!== "false") {
            console.log("      expectedBalances.unlockedToken:  ", this.toEth(this.expectedBalances.unlockedToken) + " tokens");
        }
        // console.log("      expectedBalances.pendingTokens: ", this.toEth(this.expectedBalances.pendingTokens) + " tokens");
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

        // value tx
        // const tx =  this.wallet.lightwallet.txutils.valueTx({
        //     to: to,
        //     gasLimit: 1000000,     // 1m gas
        //     gasPrice: gasPrice,
        //     value: value,
        //     nonce: nonce,
        // }),

        // fn call
        const tx = this.wallet.lightwallet.txutils.functionTx([{
            "constant": false,
            "inputs": [],
            "name": "commit",
            "outputs": [],
            "payable": true,
            "stateMutability": "payable",
            "type": "function"
        }], "commit", [], {
            to: to,
            gasLimit: 1000000,     // 1m gas
            gasPrice: gasPrice,
            value: value,
            nonce: nonce,
        });

        const signedSendValueTx = this.wallet.lightwallet.signing.signTx(
            this.wallet.keystore,
            this.properties.account.pwDerivedKey,
            tx,
            this.address
        );

        const txResult = await helpers.web3Instance.eth.sendSignedTransaction(signedSendValueTx);
        
        if(!txResult.status) {
            console.log("Error sending value transaction to rICO contract.");
            console.log(txResult);
            process.exit(1);
        }

        this.txCosts = this.txCosts.add(
            new BN(txResult.gasUsed).mul(
                new BN(gasPrice)
            )
        );

    }

    async sendTokenTx(amount, to) {

        console.log("sendTokenTx balance:", this.toEth(amount), to );

        const gasPrice = 1000000000; // 1 gwei
        const nonce = await helpers.web3Instance.eth.getTransactionCount(this.address);

        var abi = [{
            "constant": false,
            "inputs": [
                {"name": "recipient","type": "address"},
                {"name": "amount","type": "uint256"},
                {"name": "data","type": "bytes"}
            ],
            "name": "send",
            "outputs": [],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        }];

        const signedSendTokenTx = this.wallet.lightwallet.signing.signTx(
            this.wallet.keystore,
            this.properties.account.pwDerivedKey,
            this.wallet.lightwallet.txutils.functionTx(
                abi,
                'send',
                [to, amount.toString(), null],
                {
                    to: this.helpers.addresses.Token,
                    gasLimit: 500000,     // 500k gas
                    gasPrice: gasPrice,
                    value: 0,
                    nonce: nonce,
                }
            ),
            this.address
        );

        const txResult = await helpers.web3Instance.eth.sendSignedTransaction(signedSendTokenTx);
        
        if(!txResult.status) {
            console.log("Error sending token transaction to rICO contract.");
            console.log(txResult);
            process.exit(1);
        }

        this.txCosts = this.txCosts.add(
            new BN(txResult.gasUsed).mul(
                new BN(gasPrice)
            )
        );

    }

    // read balances from rICO and Token contract
    async readBalances() {
       
        const ActualEthBalance = await this.helpers.utils.getBalance(this.helpers, this.address);
       
        this.currentBalances.ETH = ActualEthBalance.sub( 
            this.extraETH.sub(this.txCosts)
        );

        this.currentBalances.Token = new BN( await this.rICOToken.methods.balanceOf(this.address).call() );
        this.currentBalances.unlockedToken = new BN( await this.rICOToken.methods.getUnlockedBalance(this.address).call() );

        const AvailableForWithdraw = await this.getAvailableEthAndTokensForWithdraw();
        this.currentBalances.withdrawableETH = AvailableForWithdraw.eth;
        
        // const record = await this.getParticipantRecord();
        // this.currentBalances.pendingTokens = record.pendingTokens;
        // this.currentBalances.allocatedETH = record.allocatedETH;
       
    }

    // check if the expected and current balances match
    async test() {

        await this.readBalances();
        // this.displayBalances();
        // this.displayExpectedBalances();

        this.expect(this.currentBalances.ETH.toString()).to.be.equal(this.expectedBalances.ETH.toString(), 'ETH balance is not as expected.');
        this.expect(this.currentBalances.Token.toString()).to.be.equal(this.expectedBalances.Token.toString(), 'Token balance is not as expected.');
        if(this.expectedBalances.withdrawableETH.toString() !== "false") {
            this.expect(this.currentBalances.withdrawableETH.toString()).to.be.equal(this.expectedBalances.withdrawableETH.toString(), 'Withdrawable ETH balance is not as expected.');
        }

        if(this.expectedBalances.unlockedToken.toString() !== "false") {
            this.expect(this.currentBalances.unlockedToken.toString()).to.be.equal(this.expectedBalances.unlockedToken.toString(), 'Unlocked Token balance is not as expected.');
        }
        
        // this.expect(this.currentBalances.pendingTokens.toString()).to.be.equal(this.expectedBalances.pendingTokens.toString(), 'Reserved Token balance is not as expected.');

        // get last item and set to valid
        const item = this.actionLog[ this.actionLog.length - 1 ];
        item.valid = true;
    }

    async getParticipantRecord() {
        const rec = await this.rICO.methods.participants(this.address).call();
  
        const retVal = {};
        retVal.committedETH            = new BN(rec.committedETH);
        retVal.pendingETH              = new BN(rec.pendingETH);
        retVal.reservedTokens     = new BN(rec.reservedTokens);
        retVal._unlockedTokens     = new BN(rec._unlockedTokens);
        retVal._currentReservedTokens   = new BN(rec._currentReservedTokens);
        retVal._lastBlock               = new BN(rec._lastBlock);
        return retVal;
    }

    getCurrentGlobalUnlockRatio() {
        return this.helpers.utils.getCurrentGlobalUnlockRatio(
            this.helpers, this.block, this.startAndEndBlocks.buyPhaseStartBlock, this.startAndEndBlocks.buyPhaseEndBlock, 20
        ); 
    }

    async getContractUnlockPercentage() {
        return await this.rICO.methods.getCurrentGlobalUnlockRatio().call();
    }

    getLastAction() {
        return this.actionLog[this.actionLog.length - 1].type;
    }


    async getMyUnlockRatio() {
        const currentBlock = await this.rICO.methods.getCurrentEffectiveBlockNumber().call();
        const buyPhaseStartBlock = this.startAndEndBlocks.buyPhaseStartBlock;
        const buyPhaseEndBlock = this.startAndEndBlocks.buyPhaseEndBlock;
        const participantRecord = await this.getParticipantRecord();

        // Calculate WITHIN the buy phase
        if (currentBlock >= buyPhaseStartBlock && currentBlock <= buyPhaseEndBlock) {

            const lastBlock = participantRecord._lastBlock;
            if(lastBlock < buyPhaseStartBlock) {
                lastBlock = buyPhaseStartBlock - 1;
            }

            const totalBlockCount = buyPhaseEndBlock - lastBlock;
            const passedBlocks = currentBlock - lastBlock;

            return passedBlocks / totalBlockCount;

        } else if (currentBlock > buyPhaseEndBlock) {
            return 1;
        }
        return 0;
    }

    async getAvailableEthAndTokensForWithdraw(_returnedTokenAmount = null) {

        const fullTokenBalance = new BN( await this.rICOToken.methods.balanceOf(this.address).call() );
        const participantStats = await this.getParticipantRecord();
        let returnedTokenAmount = fullTokenBalance;
        
        if(_returnedTokenAmount != null) {
            returnedTokenAmount = _returnedTokenAmount;
        }

        let overflowingTokenAmount = new BN("0");
        let returnEthAmount;

        let returnValues = {
            eth: new BN("0"),
            project_allocated_eth: new BN("0"),
            initial_tokens: fullTokenBalance,
            returned_tokens: new BN("0"),
            withdrawn_tokens:  new BN("0"),
        };

        // UPDATE the locked/unlocked ratio for this participant
        const participantReservedTokens = new BN( await this.rICO.methods.getParticipantReservedTokens(this.address).call() );
        
        const ratio = await this.rICO.methods.calcUnlockedAmount(
            participantStats.committedETH.toString(),
            participantStats._lastBlock.toString()
        ).call();

        const participantCommittedEth = participantStats.committedETH; //.sub(
        //     new BN( ratio )
        // );

        // Only allow reserved tokens be returned, return the overflow.
        if (returnedTokenAmount.gt(participantReservedTokens)) {
            overflowingTokenAmount = returnedTokenAmount.sub(participantReservedTokens);
            returnedTokenAmount = participantReservedTokens;
        }

        const currentStage = await this.rICO.methods.getCurrentStage().call();

        // Overwrite if stage 0
        if(currentStage == 0) {
            returnEthAmount = new BN(await this.rICO.methods.getEthAmountForTokensAtStage(returnedTokenAmount.toString(), 0).call());
        } else {
            returnEthAmount = participantCommittedEth.mul(
                returnedTokenAmount.mul(new BN(10).pow(new BN(20))).div(
                    participantStats.reservedTokens
                )
            ).div(new BN(10).pow( new BN(20)));
        }

        returnValues.eth = returnEthAmount;
        returnValues.project_allocated_eth = new BN(0);
        returnValues.withdrawn_tokens = returnedTokenAmount;
        returnValues.returned_tokens = overflowingTokenAmount;

        return returnValues;
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

    get whitelister() {
        return this.properties.init.deployment.whitelister;
    }
}

module.exports = Participant;
