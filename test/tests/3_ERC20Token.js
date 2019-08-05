
const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect
const TokenSettings = setup.settings.token;
const creator = accounts[10];

describe('ERC777 - ERC20 Token compatibility', function () {

    let HST;
    let mintedSupply = new helpers.BN( TokenSettings.supply );

    beforeEach(async function () {

        HST = await helpers.utils.deployNewContractInstance(
            helpers, "RicoToken", {
                from: creator,
                arguments: [
                    mintedSupply.toString(),
                    [] // defaultOperators
                ],
                gas: 3500000,
                gasPrice: helpers.solidity.gwei * 10
            }
        );

    });

    it('creation: in contract settings should match settings', async () => {
        expect(
            await HST.methods.name().call()
        ).to.equal(setup.settings.token.name);

        expect(
            await HST.methods.symbol().call()
        ).to.equal(setup.settings.token.symbol);
        
        expect(
            await HST.methods.decimals().call()
        ).to.equal(setup.settings.token.decimals.toString());
        
        expect(
            (await HST.methods.totalSupply().call()).toString()
        ).to.be.equal( mintedSupply.toString() );

    });

    it('creation: should create a correct initial balance for the creator', async () => {
        const balance = await HST.methods.balanceOf(creator).call();
        expect(balance).to.equal( mintedSupply.toString() );
    });

    // TRANSERS
    // normal transfers without approvals
    it('transfers: ether transfer should be reversed.', async () => {

        const balanceBefore = await HST.methods.balanceOf(creator).call();
        assert.strictEqual(balanceBefore.toString(), mintedSupply.toString() );

        await helpers.assertInvalidOpcode( async () => {
            await helpers.web3Instance.eth.sendTransaction({
                from: creator,
                to: HST.receipt.contractAddress,
                value: helpers.solidity.ether * 10,
            });
        }, "revert");
        
        const balanceAfter = await HST.methods.balanceOf(creator).call();
        expect(balanceBefore.toString()).to.equal( balanceAfter.toString() );
        expect(balanceAfter.toString()).to.equal( mintedSupply.toString() );
    });

    it('transfers: should transfer 10000 to accounts[1] with creator having at least 10000', async () => {
        await HST.methods.transfer(accounts[1], 10000).send({from: creator});
        const balance = await HST.methods.balanceOf(accounts[1]).call();
        assert.strictEqual(balance, "10000")
    });

    it('transfers: should fail when trying to transfer total amount + 1 to accounts[1] with creator having total amount', async () => {
        const balance = new helpers.BN(await HST.methods.balanceOf(creator).call());
        const amt = balance.add(new helpers.BN('1'));

        assert.strictEqual(balance.toString(), mintedSupply.toString());
        assert.equal(
            amt.toString(),
            new helpers.BN(mintedSupply).add( new helpers.BN("1") ).toString() 
        );
        
        await helpers.assertInvalidOpcode( async () => {
            await HST.methods.transfer(accounts[1], amt.toString()).send({from: creator});
        }, "revert");       
    });

    it('transfers: should handle zero-transfers normally', async () => {
        assert(await HST.methods.transfer(accounts[1], 0).send({from: creator}), 'zero-transfer has failed')
    });

    it('transfers: should throw if receiver address is 0x0', async () => {
        await helpers.assertInvalidOpcode( async () => {
            await HST.methods.transfer("0x0000000000000000000000000000000000000000", "0").send({from: creator})
        }, "ERC777: transfer to the zero address");
    });

    it('approvals: msg.sender should approve 100 to accounts[1]', async () => {
        await HST.methods.approve(accounts[1], 100).send({from: creator});
        const allowance = await HST.methods.allowance(creator, accounts[1]).call();
        assert.strictEqual(allowance, "100");
    });

    // APPROVALS

    // bit overkill. But is for testing a bug
    it('approvals: msg.sender approves accounts[1] of 100 & withdraws 20 once.', async () => {
       const balance0 = await HST.methods.balanceOf(creator).call()
       assert.strictEqual(balance0, mintedSupply.toString())
       await HST.methods.approve(accounts[1], 100).send({from: creator}); // 100
       const balance2 = await HST.methods.balanceOf(accounts[2]).call();
       assert.strictEqual(balance2, "0", 'balance2 not correct');

       // "call method" .. don't send transaction.
       HST.methods.transferFrom(creator, accounts[2], 20).call({from: accounts[1]})

       await HST.methods.allowance(creator, accounts[1]).call();
       await HST.methods.transferFrom(creator, accounts[2], 20).send({from: accounts[1]}); // -20
       const allowance01 = await HST.methods.allowance(creator, accounts[1]).call();
       assert.strictEqual(allowance01, "80") // =80
       const balance22 = await HST.methods.balanceOf(accounts[2]).call()
       assert.strictEqual(balance22, "20")
       const balance02 = await HST.methods.balanceOf(creator).call()
       assert.strictEqual(balance02, mintedSupply.sub( new helpers.BN("20") ).toString())
    });

    // should approve 100 of msg.sender & withdraw 50, twice. (should succeed)
    it('approvals: msg.sender approves accounts[1] of 100 & withdraws 20 twice.', async () => {
        await HST.methods.approve(accounts[1], 100).send({from: creator});
        const allowance01 = await HST.methods.allowance(creator, accounts[1]).call();
        assert.strictEqual(allowance01, "100");

        await HST.methods.transferFrom(creator, accounts[2], 20).send({from: accounts[1]});
        const allowance012 = await HST.methods.allowance(creator, accounts[1]).call();
        assert.strictEqual(allowance012,"80");

        const balance2 = await HST.methods.balanceOf(accounts[2]).call();
        assert.strictEqual(balance2, "20");

        const balance0 = await HST.methods.balanceOf(creator).call();
        assert.strictEqual(balance0.toString(), mintedSupply.sub(new helpers.BN("20")).toString());

        // FIRST tx done.
        // onto next.
        await HST.methods.transferFrom(creator, accounts[2], 20).send({from: accounts[1]});
        const allowance013 = await HST.methods.allowance(creator, accounts[1]).call();
        assert.strictEqual(allowance013, "60");

        const balance22 = await HST.methods.balanceOf(accounts[2]).call();
        assert.strictEqual(balance22, "40");

        const balance02 = await HST.methods.balanceOf(creator).call();
        assert.strictEqual(balance02.toString(), mintedSupply.sub(new helpers.BN("40")).toString());
    });

    // should approve 100 of msg.sender & withdraw 50 & 60 (should fail).
    it('approvals: msg.sender approves accounts[1] of 100 & withdraws 50 & 60 (2nd tx should fail)', async () => {
        await HST.methods.approve(accounts[1], 100).send({from: creator});
        const allowance01 = await HST.methods.allowance(creator, accounts[1]).call();
        assert.strictEqual(allowance01, "100");

        await HST.methods.transferFrom(creator, accounts[2], 50).send({from: accounts[1]});
        const allowance012 = await HST.methods.allowance(creator, accounts[1]).call();
        assert.strictEqual(allowance012, "50");

        const balance2 = await HST.methods.balanceOf(accounts[2]).call();
        assert.strictEqual(balance2, "50");

        const balance0 = await HST.methods.balanceOf(creator).call();
        assert.strictEqual(balance0.toString(), mintedSupply.sub(new helpers.BN("50")).toString());

        // FIRST tx done.
        // onto next.
        helpers.assertInvalidOpcode(async () => {
            await HST.methods.transferFrom(creator, accounts[2], 60).send({from: accounts[1]});
        }, "SafeMath: subtraction overflow");
    });

    it('approvals: attempt withdrawal from account with no allowance (should fail)', function () {
        return helpers.assertInvalidOpcode(async () => {
            await HST.methods.transferFrom(creator, accounts[2], 60).send({from: accounts[1]});
        }, "SafeMath: subtraction overflow");
    });

    it('approvals: allow accounts[1] 100 to withdraw from creator. Withdraw 60 and then approve 0 & attempt transfer.', async () => {
        await HST.methods.approve(accounts[1], 100).send({from: creator});
        await HST.methods.transferFrom(creator, accounts[2], 60).send({from: accounts[1]});
        await HST.methods.approve(accounts[1], 0).send({from: creator});

        return helpers.assertInvalidOpcode(async () => {
            await HST.methods.transferFrom(creator, accounts[2], 10).send({from: accounts[1]});
        }, "SafeMath: subtraction overflow");
    });

    it('approvals: approve max (2^256 - 1)', async () => {
        const numberString = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
        await HST.methods.approve(accounts[1], numberString).send({from: creator});
        const allowance = await HST.methods.allowance(creator, accounts[1]).call();
        const allowanceNum = helpers.web3util.hexToNumberString(allowance);
        assert.equal(allowanceNum, numberString);
    });

    it('allowance: should start with zero', async function() {
        const preApproved = await HST.methods.allowance(creator, accounts[1]).call();
        assert.equal(preApproved, "0");
    });

    it('approvals: approve max (2^256 - 1)', async () => {
        await HST.methods.approve(accounts[1], helpers.MAX_UINT256.toString()).send({from: creator});
        const allowance = await HST.methods.allowance(creator, accounts[1]).call();
        assert.strictEqual(allowance, helpers.MAX_UINT256.toString());
    });

    it('events: should fire Transfer event properly', async () => {
        const value = "2666";
        const tx = await HST.methods.transfer(accounts[1], value).send({from: creator});
        assert(typeof tx.events.Transfer !== "undefined", true); 
        assert.strictEqual(tx.events.Transfer.returnValues.from, creator);
        assert.strictEqual(tx.events.Transfer.returnValues.to, accounts[1]);
        assert.strictEqual(tx.events.Transfer.returnValues.value, value);
    });

    it('events: should fire Transfer event normally on a zero transfer', async () => {
        const value = "0";
        const tx = await HST.methods.transfer(accounts[1], value).send({from: creator});
        assert(typeof tx.events.Transfer !== "undefined", true); 
        assert.strictEqual(tx.events.Transfer.returnValues.from, creator);
        assert.strictEqual(tx.events.Transfer.returnValues.to, accounts[1]);
        assert.strictEqual(tx.events.Transfer.returnValues.value, value);
    });

    it('events: should fire Approval event properly', async () => {
        const value = "2666";
        const tx = await HST.methods.approve(accounts[1], value).send({from: creator});
        assert(typeof tx.events.Approval !== "undefined", true); 
        assert.strictEqual(tx.events.Approval.returnValues.owner, creator);
        assert.strictEqual(tx.events.Approval.returnValues.spender, accounts[1]);
        assert.strictEqual(tx.events.Approval.returnValues.value, value);
    });

})
