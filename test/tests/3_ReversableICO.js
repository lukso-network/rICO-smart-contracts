const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect



describe("ReversableICO", function () {

    const deployerAddress = accounts[0];
    const whitelistControllerAddress = accounts[1];
    let TokenTrackerAddress;

    before(async function () {
        // test requires ERC1820.instance
        if (helpers.ERC1820.instance == false) {
            console.log("  Error: ERC1820.instance not found, please make sure to run it first.");
            process.exit();
        }

        TokenTrackerAddress = helpers.addresses.Token;

        this.ReversableICO = await helpers.utils.deployNewContractInstance(helpers, "ReversableICO");
        console.log("      Gas used for deployment:", this.ReversableICO.receipt.gasUsed);
        console.log("      Contract Address:", this.ReversableICO.receipt.contractAddress);
        console.log("");

    });

    describe("Stage 1 - Deployment", function () {

        before(async function () {

        });

        it("Gas usage should be lower than 6.7m.", function () {
            expect(this.ReversableICO.receipt.gasUsed).to.be.below(6700000);
        });

        it("Property deployerAddress should be " + deployerAddress, async function () {
            expect(await this.ReversableICO.methods.deployerAddress().call()).to.be.equal(deployerAddress);
        });

        it("Property initialized should be false", async function () {
            expect(await this.ReversableICO.methods.initialized().call()).to.be.equal(false);
        });

        it("Property running should be false", async function () {
            expect(await this.ReversableICO.methods.running().call()).to.be.equal(false);
        });

        it("Property frozen should be false", async function () {
            expect(await this.ReversableICO.methods.frozen().call()).to.be.equal(false);
        });

        it("Property ended should be false", async function () {
            expect(await this.ReversableICO.methods.ended().call()).to.be.equal(false);
        });

        it("Property TokenTrackerAddress should be address(0)", async function () {
            expect(await this.ReversableICO.methods.TokenTrackerAddress().call()).to.be.equal("0x0000000000000000000000000000000000000000");
        });

        it("Property whitelistControllerAddress should be address(0)", async function () {
            expect(await this.ReversableICO.methods.whitelistControllerAddress().call()).to.be.equal("0x0000000000000000000000000000000000000000");
        });

    });

    describe("Stage 2 - Initialisation", function () {

        let currentBlock, StartBlock, SaleStageBlockCount, RicoStageBlockCount, EndBlock;
        before(async function () {

            currentBlock = await this.ReversableICO.methods.getCurrentBlockNumber().call();
            StartBlock = parseInt(currentBlock, 10) + 100;
            SaleStageBlockCount = 10000;
            RicoStageBlockCount = 100000;
            EndBlock = StartBlock + SaleStageBlockCount + RicoStageBlockCount;

            await this.ReversableICO.methods.addSettings(
                TokenTrackerAddress,        // address _TokenTrackerAddress
                whitelistControllerAddress, // address _whitelistControllerAddress
                StartBlock,                 // uint256 _StartBlock
                SaleStageBlockCount,        // uint256 _SaleStageBlockCount,
                RicoStageBlockCount         // uint256 _RicoStageBlockCount
            ).send({
                from: deployerAddress,  // deployer
                gas: 300000
            });

        });

        it("Property initialized should be true", async function () {
            expect(await this.ReversableICO.methods.initialized().call()).to.be.equal(true);
        });

        it("Property running should be false", async function () {
            expect(await this.ReversableICO.methods.running().call()).to.be.equal(false);
        });

        it("Property frozen should be false", async function () {
            expect(await this.ReversableICO.methods.frozen().call()).to.be.equal(false);
        });

        it("Property ended should be false", async function () {
            expect(await this.ReversableICO.methods.ended().call()).to.be.equal(false);
        });

        it("Property TokenTrackerAddress should be deployed token address", async function () {
            expect(await this.ReversableICO.methods.TokenTrackerAddress().call()).to.be.equal(TokenTrackerAddress);
        });

        it("Property whitelistControllerAddress should be " + whitelistControllerAddress, async function () {
            expect(await this.ReversableICO.methods.whitelistControllerAddress().call()).to.be.equal(whitelistControllerAddress);
        });

        it("StartBlock matches settings", async function () {
            expect(await this.ReversableICO.methods.StartBlock().call()).to.be.equal(StartBlock.toString());
        });

        it("SaleStageBlockCount matches settings", async function () {
            expect(await this.ReversableICO.methods.SaleStageBlockCount().call()).to.be.equal(SaleStageBlockCount.toString());
        });

        it("RicoStageBlockCount matches settings", async function () {
            expect(await this.ReversableICO.methods.RicoStageBlockCount().call()).to.be.equal(RicoStageBlockCount.toString());
        });

        it("EndBlock matches settings", async function () {
            expect(await this.ReversableICO.methods.EndBlock().call()).to.be.equal(EndBlock.toString());
        });
    });

    /*
    describe("Stage 3 - Funding Start", function () {
        
        before(async function () {
            
        });

        it("Gas usage should be lower than 6.7m", function () {
            expect( this.ReversableICO.receipt.gasUsed ).to.be.lower( 6700000 );
        });

    });
    */

});