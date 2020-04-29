const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect;
const lightwallet = require("eth-lightwallet");
const util = require("util");

let signers;
let safeAccounts;
const anyone = "0x0000000000000000000000000000000000000001";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const holder = accounts[10];
const manager = accounts[9];

const generateDeploymentCode = async function (name, arguments) {
    const ContractData = await helpers.utils.getAbiFile(name);
    const deployArguments = {
        data: ContractData.bytecode,
        arguments: arguments
    };
    const ContractInstance = await new helpers.web3Instance.eth.Contract(
        ContractData.abi,
        "0x0000000000000000000000000000000000000000"
    )
    .deploy(deployArguments)
    .encodeABI();

    return ContractInstance;
};

async function createLightwallet() {
    // Create lightwallet accounts
    const createVault = util
        .promisify(lightwallet.keystore.createVault)
        .bind(lightwallet.keystore);
    const keystore = await createVault({
        hdPathString: "m/44'/60'/0'/0",
        seedPhrase:
            "pull rent tower word science patrol economy legal yellow kit frequent fat",
        password: "test",
        salt: "testsalt"
    });
    const keyFromPassword = await util
        .promisify(keystore.keyFromPassword)
        .bind(keystore)("test");
    keystore.generateNewAddress(keyFromPassword, 5);

    // convert signers to proper checksummed addresses
    const addresses = keystore.getAddresses().map((value) => {
        return helpers.web3.utils.toChecksumAddress(value);
    });

    return {
        keystore: keystore,
        accounts: addresses,
        passwords: keyFromPassword
    };
}

describe("Gnosis Safe Integration", function () {

    before(async function () {
        safeAccounts = await createLightwallet();
        // clone the resulting accounts array, as it changes duiring operation!
        signers = [...safeAccounts.accounts];
    });

    describe("Deployment", async function () {

        before(async function () {

            this.GnosisSafe = await helpers.utils.deployNewContractInstance(
                helpers,
                "GnosisSafe",
                {
                    from: manager,
                    gas: 6500000,
                    gasPrice: helpers.solidity.gwei * 10
                }
            );

            helpers.addresses.GnosisSafe = this.GnosisSafe.receipt.contractAddress;
            this.CreateCall = await helpers.utils.deployNewContractInstance(
                helpers,
                "CreateCall",
                {
                    from: manager,
                    gas: 6500000,
                    gasPrice: helpers.solidity.gwei * 10
                }
            );

            helpers.addresses.CreateCall = this.CreateCall.receipt.contractAddress;

            const deploymentDataToken = await generateDeploymentCode("RicoToken", [
                []
            ]);
            const deploymentDataRico = await generateDeploymentCode(
                "ReversibleICOMock777"
            );

            let creationDataToken = this.CreateCall.methods
                .performCreate(0, deploymentDataToken)
                .encodeABI();

            let creationDataRico = this.CreateCall.methods
                .performCreate(0, deploymentDataRico)
                .encodeABI();

            await helpers.web3.eth.sendTransaction({
                from: manager,
                to: helpers.addresses.GnosisSafe,
                value: "10000000000000000000"
            });
            
            await this.GnosisSafe.methods
                .setup(
                    signers,
                    4,
                    ZERO_ADDRESS,
                    "0x",
                    ZERO_ADDRESS,
                    ZERO_ADDRESS,
                    0,
                    ZERO_ADDRESS
                )
                .send({ from: manager });

            let tx1 = await helpers.safeUtils.executeTransaction(
                safeAccounts,
                this.GnosisSafe,
                "deploy Token Contract",
                signers,
                helpers.addresses.CreateCall,
                "0",
                creationDataToken,
                1, // DELEGATECALL
                manager
            );

            let tx2 = await helpers.safeUtils.executeTransaction(
                safeAccounts,
                this.GnosisSafe,
                "deploy Rico Contract",
                signers,
                helpers.addresses.CreateCall,
                "0",
                creationDataRico,
                1, // DELEGATECALL
                manager
            );
            
            helpers.addresses.RicoToken =
                tx1.events.ContractCreation.returnValues.newContract;
            helpers.addresses.Rico =
                tx2.events.ContractCreation.returnValues.newContract;

            this.RicoToken = await helpers.utils.getContractInstance(
                helpers,
                "RicoToken",
                helpers.addresses.RicoToken
            );

            this.Rico = await helpers.utils.getContractInstance(
                helpers,
                "ReversibleICOMock",
                helpers.addresses.Rico
            );

            console.log(
                "      GnosisSafe Gas used for deployment:",
                this.GnosisSafe.receipt.gasUsed
            );
            console.log(
                "      GnosisSafe Contract Address:",
                this.GnosisSafe.receipt.contractAddress
            );

            console.log(
                "      RicoToken Gas used for deployment:",
                tx1.gasUsed
            );
            console.log(
                "      RicoToken Contract Address:",
                helpers.addresses.RicoToken
            );

            console.log(
                "      RicoContract Gas used for deployment:",
                tx2.gasUsed
            );
            console.log(
                "      RicoContract Contract Address:",
                helpers.addresses.Rico
            );

        });

        it("Gas usage should be lower than 6.7m.", async function () {
            expect(this.GnosisSafe.receipt.gasUsed).to.be.below(6700000);
        });

        describe("Correclty Sets Up", async function () {

            it("returns the signers", async function () {
                expect(
                    await this.GnosisSafe.methods.getOwners().call()
                ).to.deep.equal(
                    signers
                );
            });

            it("returns the threshold", async function () {
                expect(
                    await this.GnosisSafe.methods.getThreshold().call()
                ).to.be.equal(
                    "4"
                );
            });

        });

        // transactions need to be approved in order for the contracts to be deployed
        // enable this after that is implemented

        /*

        describe("Correclty Deploys contracts through wallet", async function () {

            it("returns the correct manager for token", async function () {

                // console.log(this.RicoToken.methods);


                // let tx = 
                // console.log(tx);
                
                let tx = await this.RicoToken.methods.name().call();
                console.log(tx);

                expect(
                    await this.RicoToken.methods.manager().call()
                ).to.deep.equal(
                    helpers.addresses.GnosisSafe
                );
            });

            
            it("Wallet has the correct balance", async function () {
                expect(
                    await this.RicoToken.methods.balanceOf().call()
                ).to.be.equal(
                    setup.settings.token.sale
                );
            });

            it("returns the correct deployer for Rico", async function () {
                expect(
                    await this.Rico.methods.deployingAddress().call()
                ).to.be.equal(
                    this.addresses.GnosisSafe
                );
            });

            it("returns the freezed status", async function () {
                expect(
                    await this.RicoToken.methods.freezed().call()
                ).to.be.equal(true);
            });
            
        });

        /*
        describe("Correctly setup Token and Rico", async function () {
            it("Setups rICO and Manager", async function () {
                let setupData = this.RicoToken.methods
                    .setup(helpers.addresses.Rico)
                    .encodeABI();
                await helpers.safeUtils.executeTransaction(
                    safeAccounts,
                    this.GnosisSafe,
                    "Setup Rico",
                    signers,
                    helpers.addresses.RicoToken,
                    "0",
                    setupData,
                    0, //CALL
                    manager
                );
                expect(await this.RicoToken.methods.rICO().call()).to.be.equal(
                    helpers.addresses.Rico
                );
            });

            describe("Can add settings to Rico Contract", async function () {
                
                const blocksPerDay = 6450;
                currentBlock = await this.ReversibleICO.methods
                    .getCurrentBlockNumber()
                    .call();

                // starts in one day
                commitPhaseStartBlock = parseInt(currentBlock, 10) + blocksPerDay * 1;

                // 22 days allocation
                commitPhaseBlockCount = blocksPerDay * 22;
                commitPhasePrice = helpers.solidity.ether * 0.002;

                // 12 x 30 day periods for distribution
                StageCount = 12;
                StageBlockCount = blocksPerDay * 30;
                StagePriceIncrease = helpers.solidity.ether * 0.0001;

                commitPhaseEndBlock = commitPhaseStartBlock + commitPhaseBlockCount - 1;

                // for validation
                BuyPhaseEndBlock = commitPhaseEndBlock + (StageBlockCount + 1) * StageCount;

                const StageStartBlock = commitPhaseEndBlock;
                let lastStageBlockEnd = StageStartBlock;

                for (let i = 0; i < StageCount; i++) {
                    const start_block = lastStageBlockEnd + 1;
                    const end_block = lastStageBlockEnd + StageBlockCount + 1;
                    const token_price = commitPhasePrice + StagePriceIncrease * (i + 1);

                    stageValidation.push({
                        start_block: start_block,
                        end_block: end_block,
                        token_price: token_price
                    });

                    lastStageBlockEnd = end_block;
                }

                let settingsData = this.Rico.methods.init(
                    TokenContractAddress,            // address _TokenContractAddress
                    whitelistingAddress,     // address _whitelistingAddress
                    projectAddress,           // address _projectAddress
                    commitPhaseStartBlock,                     // uint256 _commitPhaseStartBlock
                    commitPhaseBlockCount,           // uint256 _commitPhaseBlockCount,
                    commitPhasePrice,                // uint256 _commitPhasePrice in wei
                    StageCount,                     // uint8   _StageCount
                    StageBlockCount,                // uint256 _StageBlockCount
                    StagePriceIncrease              // uint256 _StagePriceIncrease in wei
                )
                .encodeABI();

                await helpers.safeUtils.executeTransaction(
                    safeAccounts,
                    this.GnosisSafe,
                    "Move Tokens",
                    signers,
                    helpers.addresses.Rico,
                    "0",
                    settingsData,
                    0, // CALL
                    manager
                );

                expect(
                    await this.ReversibleICO.methods.initialized().call()
                ).to.be.equal(true);

                expect(
                    await this.ReversibleICO.methods.started().call()
                ).to.be.equal(false);

                expect(
                    await this.ReversibleICO.methods.frozen().call()
                ).to.be.equal(false);

                expect(
                    await this.ReversibleICO.methods.ended().call()
                ).to.be.equal(false);

                expect(
                    await this.ReversibleICO.methods.TokenContractAddress().call()
                ).to.be.equal(TokenContractAddress);

                expect(
                    await this.ReversibleICO.methods.whitelistingAddress().call()
                ).to.be.equal(whitelistingAddress);

                expect(
                    await this.ReversibleICO.methods.projectAddress().call()
                ).to.be.equal(projectAddress);

                expect(
                    await this.ReversibleICO.methods.BuyPhaseEndBlock().call()
                ).to.be.equal(BuyPhaseEndBlock.toString());
            });

            it("Can transfer tokens to the Rico Contract", async function () {
            
                let transferData = this.RicoToken.methods
                    .transfer(
                        helpers.addresses.Rico,
                        setup.settings.token.sale.toString()
                    )
                    .encodeABI();
    
                await helpers.safeUtils.executeTransaction(
                    safeAccounts,
                    this.GnosisSafe,
                    "Move Tokens",
                    signers,
                    helpers.addresses.RicoToken,
                    "0",
                    transferData,
                    0, //CALL
                    manager
                );
                // This will fail for now because this method isn'timplemented on Rico itself
                expect(
                    await this.RicoToken.methods.balanceOf(helpers.addresses.Rico).call()
                ).to.be.equal(setup.settings.token.sale.toString());
            });
        });
        */
    });
});
