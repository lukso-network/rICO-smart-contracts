/*
 * The deployer
 *
 * @author Fabian Vogelsteller <@frozeman>, Micky Socaci <micky@nowlive.ro>
*/

module.exports = {
    async run (init) {

        const helpers = init.setup.helpers;
        const BN = helpers.BN;
        const MAX_UINT256 = helpers.MAX_UINT256;
        const expect = helpers.expect
        const ContractsDeployer = init.accounts[1];
        const whitelistControllerAddress = init.accounts[2];
        const projectWalletAddress = init.accounts[3];
        const RicoSaleSupply = init.setup.settings.token.sale.toString();
        const ERC777data = helpers.web3Instance.utils.sha3('777TestData');
        const blocksPerDay = 6450;

        /*
         * Deployment - ERC1820
         */
        console.log("    Deploying ERC1820 Contract");
        let deploymentTx = await this.deployERC1820 (init);
        console.log("      Gas used for deployment:", deploymentTx.gasUsed);
        console.log("      Contract Address:", deploymentTx.contractAddress);
        console.log("");

        /*
         * Deployment - rICO Token Contract
         */
        console.log("    Deploying rICO Token Contract");
        deploymentTx = await this.deployrICOToken(init, ContractsDeployer);
        console.log("      Gas used for deployment:", deploymentTx.gasUsed);
        console.log("      Contract Address:", deploymentTx.contractAddress);
        console.log("");

        /*
         * Deployment - rICO Contract
         */

        console.log("    Deploying rICO Contract");
        deploymentTx = await this.deployrICO(init, ContractsDeployer);
        console.log("      Gas used for deployment:", deploymentTx.gasUsed);
        console.log("      Contract Address:", deploymentTx.contractAddress);
        console.log("");


        /*
         * Setup - Token
         */
        // Add rICO contract into token contract
        const rICOToken = await helpers.utils.getContractInstance(helpers, "RicoToken", helpers.addresses.Token);
        await rICOToken.methods.setup(
            helpers.addresses.Rico
        ).send({
            from: ContractsDeployer,  // initial token supply holder
        });

        /*
         * Setup - rICO - 1 - add Settings
         */
        const rICO = await helpers.utils.getContractInstance(helpers, "ReversibleICOMock", helpers.addresses.Rico);

        let currentBlock = await rICO.methods.getCurrentBlockNumber().call();

        // starts in one day
        const commitPhaseStartBlock = parseInt(currentBlock, 10) + blocksPerDay * 1;

        // 22 days allocation
        const commitPhaseBlockCount = blocksPerDay * 22;
        const commitPhasePrice = helpers.solidity.ether * 0.002;

        // 12 x 30 day periods for distribution
        const StageCount = 12;
        const StageBlockCount = blocksPerDay * 30;
        const StagePriceIncrease = helpers.solidity.ether * 0.0001;

        await rICO.methods.init(
            helpers.addresses.Token,     // address _tokenContractAddress
            whitelistControllerAddress,  // address _whitelistControllerAddress
            projectWalletAddress,        // address _projectWalletAddress
            commitPhaseStartBlock,       // uint256 _commitPhaseStartBlock
            commitPhaseBlockCount,       // uint256 _commitPhaseBlockCount,
            commitPhasePrice,            // uint256 _commitPhasePrice in wei
            StageCount,                  // uint8   _stageCount
            StageBlockCount,             // uint256 _stageBlockCount
            StagePriceIncrease           // uint256 _stagePriceIncrease in wei
        ).send({
            from: ContractsDeployer,  // deployer
            gas: 3000000
        });

        expect(await rICO.methods.initialized().call()).to.be.equal(true);

        /*
         * Setup - rICO - 2 - add Tokens
         */
        // send all tokens to projectWalletAddress
        await rICOToken.methods.send(
            projectWalletAddress,
            init.setup.settings.token.supply.toString(),
            ERC777data
        ).send({
            from: ContractsDeployer,  // initial token supply holder
            gas: 100000
        });
        
        // send sale supply to rico
        await rICOToken.methods.send(
            helpers.addresses.Rico,
            RicoSaleSupply,
            ERC777data
        ).send({
            from: projectWalletAddress,  // initial token supply holder
            gas: 100000
        });

        return {
            addresses: {
                ContractsDeployer: ContractsDeploye,
                whitelistControllerAddress: whitelistControllerAddress,
                projectWalletAddress: projectWalletAddress,
            },
            contracts: {
                rICOToken:rICOToken,
                rICO:rICO
            }
        }
    },
    async deployERC1820 (init) {

        const helpers = init.setup.helpers;
        const expect = helpers.expect

        let ContractCode = await new helpers.web3Instance.eth.getCode(helpers.ERC1820.ContractAddress);
        expect( ContractCode ).to.be.equal( "0x" );

        let SenderBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.SenderAddress);
        expect( SenderBalance ).to.be.bignumber.equal( '0' );

        const SupplierBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.FundsSupplierAddress);
        let deploymentCost = new helpers.BN( helpers.ERC1820.deploymentCost.toString() );
        expect( SupplierBalance ).to.be.bignumber.above( deploymentCost );

        txGasPrice = 20000000000; // 20 gwei
        const initialFundsSupplierBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.FundsSupplierAddress);

        // transfer deploymentCost from SupplierBalance to SenderAddress and validate
        const valueTransferTx = await helpers.web3Instance.eth.sendTransaction({
            from: helpers.ERC1820.FundsSupplierAddress,
            to: helpers.ERC1820.SenderAddress,
            value: helpers.ERC1820.deploymentCost.toString(),
            gasPrice: txGasPrice,
        });

        // FundsSupplier balance has deploymentCost + tx fee substracted
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


        // SenderAddress balance is equal to deploymentCost
        SenderBalance = await helpers.utils.getBalance(helpers, helpers.ERC1820.SenderAddress);
        deploymentCost = new helpers.BN( helpers.ERC1820.deploymentCost.toString() );
        expect( SenderBalance ).to.be.bignumber.equal( deploymentCost );

        // sendRawTransaction if upgrading to the latest web3
        const deploymentTx = await helpers.web3Instance.eth.sendSignedTransaction( helpers.ERC1820.RawTx );

        // Transaction status
        expect( deploymentTx.status ).to.be.equal( true );

        // signature is valid
        expect( deploymentTx.v ).to.be.equal( helpers.ERC1820.sig.v );
        expect( deploymentTx.r ).to.be.equal( helpers.ERC1820.sig.r );
        expect( deploymentTx.s ).to.be.equal( helpers.ERC1820.sig.s );

        // from address is correct
        expect( deploymentTx.from ).to.be.equal( helpers.ERC1820.SenderAddress.toLowerCase() );

        // Contract address is 0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24
        expect( deploymentTx.contractAddress ).to.be.equal( helpers.ERC1820.ContractAddress );

        // setup contract instance
        helpers.ERC1820.instance = await new helpers.web3Instance.eth.Contract( helpers.ERC1820.abi, helpers.ERC1820.ContractAddress );
    

        // code at address exists
        ContractCode = await new helpers.web3Instance.eth.getCode(helpers.ERC1820.ContractAddress);
        expect( ContractCode.length ).to.be.equal( 5004 );
    
        // contract has the getManager method which can be called
        const getManager = await helpers.ERC1820.instance.methods.getManager( accounts[0] ).call();
        expect( getManager ).to.be.equal( accounts[0] );

        return deploymentTx;
    },
    async deployrICOToken(init, ContractsDeployer) {

        const helpers = init.setup.helpers;
        const setup = init.setup;
        const expect = helpers.expect
        const defaultOperators = [];

        if (helpers.ERC1820.instance == false) {
            console.log(
                "  Error: ERC1820.instance not found, please make sure to run it first."
            );
            process.exit();
        }

        const rICOToken = await helpers.utils.deployNewContractInstance(
            helpers,
            "RicoToken",
            {
                from: ContractsDeployer,
                arguments: [init.setup.settings.token.supply.toString(), defaultOperators],
                gas: 6500000,
                gasPrice: helpers.solidity.gwei * 10
            }
        );

        expect(await rICOToken.methods.name().call()).to.equal(
            setup.settings.token.name
        );
        expect(await rICOToken.methods.symbol().call()).to.equal(
            setup.settings.token.symbol
        );
        expect(await rICOToken.methods.granularity().call()).to.be.equal(
            "1"
        );
        expect(await rICOToken.methods.totalSupply().call()).to.be.equal(
            setup.settings.token.supply.toString()
        );

        helpers.addresses.Token = rICOToken.receipt.contractAddress;
        return rICOToken.receipt;
    },
    async deployrICO(init, ContractsDeployer) {

        const helpers = init.setup.helpers;
        const BN = helpers.BN;
        const MAX_UINT256 = helpers.MAX_UINT256;
        const expect = helpers.expect

        if (helpers.ERC1820.instance == false) {
            console.log(
                "  Error: ERC1820.instance not found, please make sure to run it first."
            );
            process.exit();
        }

        const ReversibleICO = await helpers.utils.deployNewContractInstance(
            helpers, "ReversibleICOMock", {from: ContractsDeployer}
        );
        expect(await ReversibleICO.methods.deployerAddress().call()).to.be.equal(ContractsDeployer);
        helpers.addresses.Rico = ReversibleICO.receipt.contractAddress;

        expect(await ReversibleICO.methods.initialized().call()).to.be.equal(false);

        return ReversibleICO.receipt;
    }
} 