module.exports = function(setup) {

    let helpers = setup.helpers;

    contract('ERC20 Token - fixed supply -', accounts => {
        const TokenContract = artifacts.require('TestToken');
        let HST;

        const ExpectedTokenSettings = {
            supply: new helpers.BigNumber(500).mul(10 ** 6).mul( 10 ** 18 ), // 500 mil tokens;
            decimals: 18,                                                    // Amount of decimals for display purposes
            name: "BlockBits.IO Token",                                      // Set the name for display purposes
            symbol: "BBXv2",                                                 // Set the symbol for display purposes
            version: "2",                                                    // Set token version string
        };

        beforeEach(async () => {
            HST = await TokenContract.new();
        });

        it('creation: in contract settings should match constructor parameters', async () => {
            let decimals = await HST.decimals.call();
            let supply = await HST.totalSupply.call();

            assert.equal(ExpectedTokenSettings.name,                await HST.name.call(),      'name invalid');
            assert.equal(ExpectedTokenSettings.symbol,              await HST.symbol.call(),    'symbol invalid');
            assert.equal(ExpectedTokenSettings.supply.toNumber(),   supply.toNumber(),          'totalSupply invalid');
            assert.equal(ExpectedTokenSettings.decimals,            decimals.toString(),        'decimals invalid');
            assert.equal(ExpectedTokenSettings.version,             await HST.version.call(),   'version invalid');
        });

        it('creation: should create a correct initial balance for the creator', async () => {
            const balance = await HST.balanceOf.call(accounts[0]);
            assert.strictEqual(balance.toString(), ExpectedTokenSettings.supply.toString())
        });

        it('creation: test correct setting of vanity information', async () => {
            const name = await HST.name.call();
            assert.strictEqual(name, ExpectedTokenSettings.name);
            const decimals = await HST.decimals.call();
            assert.strictEqual(decimals.toNumber(), ExpectedTokenSettings.decimals);
            const symbol = await HST.symbol.call();
            assert.strictEqual(symbol, ExpectedTokenSettings.symbol)
        });

        // TRANSERS
        // normal transfers without approvals
        it('transfers: ether transfer should be reversed.', async () => {
            const balanceBefore = await HST.balanceOf.call(accounts[0]);
            assert.strictEqual(balanceBefore.toString(), ExpectedTokenSettings.supply.toString());

            web3.eth.sendTransaction({from: accounts[0], to: HST.address, value: web3.toWei('10', 'Ether')}, async (err, res) => {
                helpers.assertInvalidOpcode(async () => {
                    await new Promise((resolve, reject) => {
                        if (err) reject(err);
                        resolve(res);
                    })
                });

                let balanceAfter = await HST.balanceOf.call(accounts[0]);
                assert.strictEqual(balanceAfter.toString(), ExpectedTokenSettings.supply.toString())
            })
        });

        it('transfers: should transfer 10000 to accounts[1] with accounts[0] having 10000', async () => {
            await HST.transfer(accounts[1], 10000, {from: accounts[0]});
            const balance = await HST.balanceOf.call(accounts[1]);
            assert.strictEqual(balance.toNumber(), 10000)
        });

        it('transfers: should fail when trying to transfer total amount +1 to accounts[1] with accounts[0] having total amount', async () => {

            let balance  = await HST.balanceOf.call(accounts[0]);
            let amt = balance.add(new helpers.BigNumber('1'));
            assert.strictEqual(balance.toString(), ExpectedTokenSettings.supply.toString());
            assert.equal(amt.toNumber(), ExpectedTokenSettings.supply.add( new helpers.BigNumber("1") ).toString() );
            return helpers.assertInvalidOpcode(async () => {
                await HST.transfer.call(accounts[1], amt, {from: accounts[0]})
            });
        });

        it('transfers: should handle zero-transfers normally', async () => {
            assert(await HST.transfer.call(accounts[1], 0, {from: accounts[0]}), 'zero-transfer has failed')
        });

        it('transfers: should throw if receiver address is 0x0', async () => {
            return helpers.assertInvalidOpcode(async () => {
                await HST.transfer.sendTransaction(0, 0, {from: accounts[0]})
            });
        });

        it('transferFrom: should throw if receiver address is 0x0', async () => {
            const TestERC20Caller = await artifacts.require('TestERC20Caller').new();
            return helpers.assertInvalidOpcode(async () => {
                await TestERC20Caller.callTestTransfer.sendTransaction(HST.address);
            });
        });

        // NOTE: testing uint256 wrapping is impossible in this standard token since you can't supply > 2^256 -1
        // todo: transfer max amounts

        // APPROVALS
        it('approvals: msg.sender should approve 100 to accounts[1]', async () => {
            await HST.approve(accounts[1], 100, {from: accounts[0]});
            const allowance = await HST.allowance.call(accounts[0], accounts[1]);
            assert.strictEqual(allowance.toNumber(), 100)
        });

        // bit overkill. But is for testing a bug
        it('approvals: msg.sender approves accounts[1] of 100 & withdraws 20 once.', async () => {
            const balance0 = await HST.balanceOf.call(accounts[0]);
            assert.strictEqual(balance0.toString(), ExpectedTokenSettings.supply.toString());

            await HST.approve(accounts[1], 100, {from: accounts[0]}); // 100
            const balance2 = await HST.balanceOf.call(accounts[2]);
            assert.strictEqual(balance2.toNumber(), 0, 'balance2 not correct');

            HST.transferFrom.call(accounts[0], accounts[2], 20, {from: accounts[1]});
            await HST.allowance.call(accounts[0], accounts[1]);
            await HST.transferFrom(accounts[0], accounts[2], 20, {from: accounts[1]}); // -20
            const allowance01 = await HST.allowance.call(accounts[0], accounts[1]);
            assert.strictEqual(allowance01.toNumber(), 80); // =80

            const balance22 = await HST.balanceOf.call(accounts[2]);
            assert.strictEqual(balance22.toNumber(), 20);

            const balance02 = await HST.balanceOf.call(accounts[0]);
            assert.strictEqual(balance02.toString(), ExpectedTokenSettings.supply.sub( new helpers.BigNumber("20") ).toString())
        });

        // should approve 100 of msg.sender & withdraw 50, twice. (should succeed)
        it('approvals: msg.sender approves accounts[1] of 100 & withdraws 20 twice.', async () => {
            await HST.approve(accounts[1], 100, {from: accounts[0]});
            const allowance01 = await HST.allowance.call(accounts[0], accounts[1]);
            assert.strictEqual(allowance01.toNumber(), 100);

            await HST.transferFrom(accounts[0], accounts[2], 20, {from: accounts[1]});
            const allowance012 = await HST.allowance.call(accounts[0], accounts[1]);
            assert.strictEqual(allowance012.toNumber(), 80);

            const balance2 = await HST.balanceOf.call(accounts[2]);
            assert.strictEqual(balance2.toNumber(), 20);

            const balance0 = await HST.balanceOf.call(accounts[0]);
            assert.strictEqual(balance0.toString(), ExpectedTokenSettings.supply.sub(new helpers.BigNumber("20")).toString());

            // FIRST tx done.
            // onto next.
            await HST.transferFrom(accounts[0], accounts[2], 20, {from: accounts[1]});
            const allowance013 = await HST.allowance.call(accounts[0], accounts[1]);
            assert.strictEqual(allowance013.toNumber(), 60);

            const balance22 = await HST.balanceOf.call(accounts[2]);
            assert.strictEqual(balance22.toNumber(), 40);

            const balance02 = await HST.balanceOf.call(accounts[0]);
            assert.strictEqual(balance02.toString(), ExpectedTokenSettings.supply.sub(new helpers.BigNumber("40")).toString());
        });

        // should approve 100 of msg.sender & withdraw 50 & 60 (should fail).
        it('approvals: msg.sender approves accounts[1] of 100 & withdraws 50 & 60 (2nd tx should fail)', async () => {
            await HST.approve(accounts[1], 100, {from: accounts[0]});
            const allowance01 = await HST.allowance.call(accounts[0], accounts[1]);
            assert.strictEqual(allowance01.toNumber(), 100);

            await HST.transferFrom(accounts[0], accounts[2], 50, {from: accounts[1]});
            const allowance012 = await HST.allowance.call(accounts[0], accounts[1]);
            assert.strictEqual(allowance012.toNumber(), 50);

            const balance2 = await HST.balanceOf.call(accounts[2]);
            assert.strictEqual(balance2.toNumber(), 50);

            const balance0 = await HST.balanceOf.call(accounts[0]);
            assert.strictEqual(balance0.toString(), ExpectedTokenSettings.supply.sub(new helpers.BigNumber("50")).toString());

            // FIRST tx done.
            // onto next.
            return helpers.assertInvalidOpcode(async () => {
                await HST.transferFrom.call(accounts[0], accounts[2], 60, {from: accounts[1]});
            });
        });

        it('approvals: attempt withdrawal from account with no allowance (should fail)', function () {
            return helpers.assertInvalidOpcode(async () => {
                await HST.transferFrom.call(accounts[0], accounts[2], 60, {from: accounts[1]});
            });
        });

        it('approvals: allow accounts[1] 100 to withdraw from accounts[0]. Withdraw 60 and then approve 0 & attempt transfer.', async () => {
            await HST.approve(accounts[1], 100, {from: accounts[0]});
            await HST.transferFrom(accounts[0], accounts[2], 60, {from: accounts[1]});
            await HST.approve(accounts[1], 0, {from: accounts[0]});

            return helpers.assertInvalidOpcode(async () => {
                await HST.transferFrom(accounts[0], accounts[2], 10, {from: accounts[1]});
            });
        });

        it('approvals: approve max (2^256 - 1)', async () => {
            let numberString = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
            await HST.approve(accounts[1], numberString, {from: accounts[0]});
            const allowance = await HST.allowance.call(accounts[0], accounts[1]);
            let allowanceNum = helpers.web3util.hexToNumberString(allowance);
            assert.equal(allowanceNum, numberString);
        });

        // should approve max of msg.sender & withdraw 20 without changing allowance (should succeed).
        it('approvals: msg.sender approves accounts[1] of max (2^256 - 1) & withdraws 20', async () => {
            const balance0 = await HST.balanceOf.call(accounts[0]);
            assert.strictEqual(balance0.toString(), ExpectedTokenSettings.supply.toString());

            const max = '1.15792089237316195423570985008687907853269984665640564039457584007913129639935e+77';
            await HST.approve(accounts[1], max, {from: accounts[0]});
            const balance2 = await HST.balanceOf.call(accounts[2]);
            assert.strictEqual(balance2.toNumber(), 0, 'balance2 not correct');

            await HST.transferFrom(accounts[0], accounts[2], 20, {from: accounts[1]});
            const allowance01 = await HST.allowance.call(accounts[0], accounts[1]);

            assert.equal(allowance01.toNumber(), max);

            const balance22 = await HST.balanceOf.call(accounts[2]);
            assert.strictEqual(balance22.toNumber(), 20);

            const balance02 = await HST.balanceOf.call(accounts[0]);
            assert.strictEqual(balance02.toString(), ExpectedTokenSettings.supply.sub(new helpers.BigNumber("20")).toString());
        });

        it('allowance: should start with zero', async function() {
            let preApproved = await HST.allowance.call(accounts[0], accounts[1]);
            assert.equal(preApproved, 0);
        });

        it('allowance: should increase by 50 then decrease by 10', async function() {
            await HST.increaseApproval(accounts[1], 50);
            let postIncrease = await HST.allowance.call(accounts[0], accounts[1]);
            assert.equal(postIncrease, 50, 'Approval after increase should be 50');
            await HST.decreaseApproval(accounts[1], 10);
            let postDecrease = await HST.allowance.call(accounts[0], accounts[1]);
            assert.equal(postDecrease, 40, 'Approval after decrease should be 40');
        });

        it('allowance: should be set to zero if decrease value is higher than existing', async function() {
            await HST.increaseApproval(accounts[1], 50);
            await HST.decreaseApproval(accounts[1], 70);
            let postDecrease = await HST.allowance.call(accounts[0], accounts[1]);
            assert.equal(postDecrease, 0, 'Approval after decrease should be 0');
        });

        it('events: should fire Transfer event properly', async () => {
            let eventFilter = helpers.utils.hasEvent(
                await HST.transfer(accounts[1], '2666', {from: accounts[0]}),
                'Transfer(address,address,uint256)'
            );
            assert.equal(eventFilter.length, 1, 'Transfer event not received.');

            let _from = helpers.utils.topicToAddress( eventFilter[0].topics[1] );
            let _to = helpers.utils.topicToAddress( eventFilter[0].topics[2] );
            // let _value = helpers.web3util.toDecimal( eventFilter[0].topics[3] );

            assert.strictEqual(_from, accounts[0]);
            assert.strictEqual(_to, accounts[1]);
            // assert.strictEqual(_value.toString(), '2666');
        });

        it('events: should fire Transfer event normally on a zero transfer', async () => {
            let eventFilter = helpers.utils.hasEvent(
                await HST.transfer(accounts[1], '0', {from: accounts[0]}),
                'Transfer(address,address,uint256)'
            );
            assert.equal(eventFilter.length, 1, 'Transfer event not received.');

            let _from = helpers.utils.topicToAddress( eventFilter[0].topics[1] );
            let _to = helpers.utils.topicToAddress( eventFilter[0].topics[2] );
            // let _value = helpers.web3util.toDecimal( eventFilter[0].topics[3] );

            assert.strictEqual(_from, accounts[0]);
            assert.strictEqual(_to, accounts[1]);
            // assert.strictEqual(_value.toString(), '0');
        });

        it('events: should fire Approval event properly', async () => {
            let eventFilter = helpers.utils.hasEvent(
                await HST.approve(accounts[1], '2666', {from: accounts[0]}),
                'Approval(address,address,uint256)'
            );
            assert.equal(eventFilter.length, 1, 'Approval event not received.');

            let _from = helpers.utils.topicToAddress( eventFilter[0].topics[1] );
            let _to = helpers.utils.topicToAddress( eventFilter[0].topics[2] );
            // let _value = helpers.web3util.toDecimal( eventFilter[0].topics[3] );

            assert.strictEqual(_from, accounts[0]);
            assert.strictEqual(_to, accounts[1]);
            // assert.strictEqual(_value.toString(), '2666');
        });

        it('burn: should decrease supply by burn amount', async () => {

            let _val = 100;
            let initialSupply = await HST.totalSupply.call();

            await HST.burn(_val, {from: accounts[0]});

            let afterSupply = await HST.totalSupply.call();
            let validate = afterSupply.add(_val);

            assert.equal(initialSupply.toString(), validate.toString());
        });
    })
};
