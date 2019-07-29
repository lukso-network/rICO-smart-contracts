const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect


describe("ReversableICO", function () {

    before(async function () {
        // test requires ERC1820.instance
        if(helpers.ERC1820.instance == false) {
            console.log("  Error: ERC1820.instance not found, please make sure to run it first.");
            process.exit();
        }
    });

    describe("Stage 1 - Deployment", function () {
        
        before(async function () {
            this.ReversableICO = await helpers.utils.deployNewContractInstance(helpers, "ReversableICO");
            console.log("      Gas used for deployment:", this.ReversableICO.receipt.gasUsed);
            console.log("      Contract Address:", this.ReversableICO.receipt.contractAddress);
            console.log("");
        });

        it("Gas usage should be lower than 6.7m.", function () {
            expect( this.ReversableICO.receipt.gasUsed ).to.be.below( 6700000 );
        });

        it("Property deployerAddress should be accounts[0]", async function () {
            expect( await this.ReversableICO.methods.deployerAddress().call() ).to.be.equal(accounts[0]);
        });

        it("Property initialized should be false", async function () {
            expect( await this.ReversableICO.methods.initialized().call() ).to.be.equal(false);
        });

        it("Property running should be false", async function () {
            expect( await this.ReversableICO.methods.running().call() ).to.be.equal(false);
        });

        it("Property frozen should be false", async function () {
            expect( await this.ReversableICO.methods.frozen().call() ).to.be.equal(false);
        });

        it("Property ended should be false", async function () {
            expect( await this.ReversableICO.methods.ended().call() ).to.be.equal(false);
        });       
        
        it("Property TokenTrackerAddress should be address(0)", async function () {
            expect( await this.ReversableICO.methods.TokenTrackerAddress().call() ).to.be.equal("0x0000000000000000000000000000000000000000");
        });
        

    });

    /*
    describe("Stage 2 - Initialisation", function () {
        
        before(async function () {
            this.ReversableICO = await helpers.utils.deployNewContractInstance(helpers, "ReversableICO");
        });

        it("Gas usage should be lower than 6.7m", function () {
            expect( this.ReversableICO.receipt.gasUsed ).to.be.lower( 6700000 );
        });

    });
    */

});