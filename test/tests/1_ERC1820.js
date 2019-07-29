const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

describe("ERC1820 - Token Registry", function () {

    describe("Step 1 - Before deployment state", function () {
        
        it("Contract Code at address: " + helpers.ERC1820.ContractAddress + " should be 0x", async function () {
            const ContractCode = await new helpers.web3Instance.eth.getCode(helpers.ERC1820.ContractAddress);
            expect( ContractCode ).to.be.equal( "0x" );
        });

        it("Deployer address: " + helpers.ERC1820.SenderAddress + " balance should be 0 eth", async function () {
            const SenderBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.SenderAddress);
            expect( SenderBalance ).to.be.bignumber.equal( '0' );
        });

        it("Funds Supplier address: " + helpers.ERC1820.FundsSupplierAddress + " balance should be at least 0.08 eth", async function () {
            const SupplierBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.FundsSupplierAddress);
            const deploymentCost = new helpers.BN( helpers.ERC1820.deploymentCost.toString() );
            expect( SupplierBalance ).to.be.bignumber.above( deploymentCost );
        });
    });

    describe("Step 2 - Deployment preparation", function () {
        
        let valueTransferTx, initialFundsSupplierBalance, txGasPrice;
        before(async function () {

            txGasPrice = 20000000000; // 20 gwei
            initialFundsSupplierBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.FundsSupplierAddress);

            // transfer deploymentCost from SupplierBalance to SenderAddress and validate
            valueTransferTx = await helpers.web3Instance.eth.sendTransaction({
                from: helpers.ERC1820.FundsSupplierAddress,
                to: helpers.ERC1820.SenderAddress,
                value: helpers.ERC1820.deploymentCost.toString(),
                gasPrice: txGasPrice,
            });

        });

        describe("New Account balances after Supplier sends value to SenderAddress", function () {

            it("FundsSupplier balance has deploymentCost + tx fee substracted", async function () {

                const newSupplierBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.FundsSupplierAddress);

                // gas used
                let combinedValue = new helpers.BN( valueTransferTx.gasUsed.toString() )
                // times gas price
                combinedValue = combinedValue.mul( new helpers.BN( txGasPrice ) );
                // add value sent
                combinedValue = combinedValue.add( new helpers.BN( helpers.ERC1820.deploymentCost.toString() ) );

                // initial minus sent + gas * gas price
                const newCalculatedBalance = initialFundsSupplierBalance.sub(combinedValue);

                expect( newSupplierBalance ).to.be.bignumber.equal( newCalculatedBalance );
            });

            it("SenderAddress balance is equal to deploymentCost", async function () {
                const SenderBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.SenderAddress);
                const deploymentCost = new helpers.BN( helpers.ERC1820.deploymentCost.toString() );
                expect( SenderBalance ).to.be.bignumber.equal( deploymentCost );
            });
        });

    });


    describe("Step 3 - ERC1820 Deployment", function () {
        
        let deploymentTx;
        before(async function () {

            // sendRawTransaction if upgrading to the latest web3
            deploymentTx = await helpers.web3Instance.eth.sendSignedTransaction( helpers.ERC1820.RawTx );

            console.log("      Gas used for deployment:", deploymentTx.gasUsed);
            console.log("      Contract Address:", deploymentTx.contractAddress);
            console.log("");

        });
        
        describe("Validation after ERC1820 Registry contract deployment", function () {

            describe("Transaction", function () {

                it("status is true", async function () {
                    expect( deploymentTx.status ).to.be.equal( true );
                });

                it("signature is valid", async function () {
                    expect( deploymentTx.v ).to.be.equal( helpers.ERC1820.sig.v );
                    expect( deploymentTx.r ).to.be.equal( helpers.ERC1820.sig.r );
                    expect( deploymentTx.s ).to.be.equal( helpers.ERC1820.sig.s );
                });

                it("from address is correct", async function () {
                    expect( deploymentTx.from ).to.be.equal( helpers.ERC1820.SenderAddress.toLowerCase() );
                });

                it("Contract address is 0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24", async function () {
                    expect( deploymentTx.contractAddress ).to.be.equal( helpers.ERC1820.ContractAddress );
                });

            });

            describe("Contract", function () {

                before(async function () {
                    // initiate global instance
                    helpers.ERC1820.instance = await new helpers.web3Instance.eth.Contract( helpers.ERC1820.abi, helpers.ERC1820.ContractAddress );
                });

                it("code at address exists", async function () {
                    const ContractCode = await new helpers.web3Instance.eth.getCode(helpers.ERC1820.ContractAddress);
                    expect( ContractCode.length ).to.be.equal( 5004 );
                });

                it("contract has the getManager method which can be called", async function () {
                    const test = await helpers.ERC1820.instance.methods.getManager( accounts[0] ).call();
                    expect( test ).to.be.equal( accounts[0] );
                });

            });

        });

    });

});
