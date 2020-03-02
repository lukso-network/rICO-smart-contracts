const helpers = setup.helpers;
const BN = helpers.BN;
const MAX_UINT256 = helpers.MAX_UINT256;
const expect = helpers.expect

describe('SafeMath', function () {
    beforeEach(async function () {
        this.safeMath = await helpers.utils.deployNewContractInstance(helpers, "SafeMathMock");
    });

    async function testCommutative (fn, lhs, rhs, expected) {
        await expect(await fn(lhs.toString(), rhs.toString()).call()).to.be.equal(expected.toString());
        await expect(await fn(rhs.toString(), lhs.toString()).call()).to.be.equal(expected.toString());
    }

    describe('add', function () {
        it('adds correctly', async function () {
            const a = new BN('5678');
            const b = new BN('1234');
            await testCommutative(this.safeMath.methods.add, a, b, a.add(b));
        });

        it('reverts on addition overflow', async function () {
            const a = MAX_UINT256;
            const b = new BN('1');

            await helpers.assertInvalidOpcode(async () => {
                await this.safeMath.methods.add(
                    a.toString(), b.toString()
                ).call();
            }, "SafeMath: addition overflow");

            await helpers.assertInvalidOpcode(async () => {
                await this.safeMath.methods.add(
                    b.toString(), a.toString()
                ).call();
            }, "SafeMath: addition overflow");
        });
        
    });

    describe('sub', function () {
        it('subtracts correctly', async function () {
            const a = new BN('5678');
            const b = new BN('1234');

            await expect(
                await this.safeMath.methods.sub(a.toString(), b.toString()).call()
            ).to.be.equal(
                a.sub(b).toString()
            );
        });

        it('reverts if subtraction result would be negative', async function () {
            const a = new BN('1234');
            const b = new BN('5678');

            await helpers.assertInvalidOpcode(async () => {
                await this.safeMath.methods.sub(
                    a.toString(), b.toString()
                ).call();
            }, "SafeMath: subtraction overflow");

        });
    });

    describe('mul', function () {
        it('multiplies correctly', async function () {
            const a = new BN('1234');
            const b = new BN('5678');

            await testCommutative(this.safeMath.methods.mul, a, b, a.mul(b).toString());
        });

        it('multiplies by zero correctly', async function () {
            const a = new BN('0');
            const b = new BN('5678');

            await testCommutative(this.safeMath.methods.mul, a, b, '0');
        });

        it('reverts on multiplication overflow', async function () {
            const a = MAX_UINT256;
            const b = new BN('2');

            await helpers.assertInvalidOpcode(async () => {
                await this.safeMath.methods.mul(
                    a.toString(), b.toString()
                ).call();
            }, "SafeMath: multiplication overflow");
        });
    });

    describe('div', function () {
        it('divides correctly', async function () {
            const a = new BN('5678');
            const b = new BN('5678');

            expect(await this.safeMath.methods.div(a.toString(), b.toString()).call()).to.be.equal(a.div(b).toString());
        });

        it('divides zero correctly', async function () {
            const a = new BN('0');
            const b = new BN('5678');

            expect(await this.safeMath.methods.div(a.toString(), b.toString()).call()).to.be.equal('0');
        });

        it('returns complete number result on non-even division', async function () {
            const a = new BN('7000');
            const b = new BN('5678');

            expect(await this.safeMath.methods.div(a.toString(), b.toString()).call()).to.be.equal('1');
        });

        it('reverts on division by zero', async function () {
            const a = new BN('5678');
            const b = new BN('0');

            await helpers.assertInvalidOpcode(async () => {
                await this.safeMath.methods.div(
                    a.toString(), b.toString()
                ).call();
            }, "SafeMath: division by zero");
        });
    });


    describe('mod', function () {
        describe('modulos correctly', async function () {
            it('when the dividend is smaller than the divisor', async function () {
                const a = new BN('284');
                const b = new BN('5678');

                expect(await this.safeMath.methods.mod(a.toString(), b.toString()).call()).to.be.equal(a.mod(b).toString());
            });

            it('when the dividend is equal to the divisor', async function () {
                const a = new BN('5678');
                const b = new BN('5678');

                expect(await this.safeMath.methods.mod(a.toString(), b.toString()).call()).to.be.equal(a.mod(b).toString());
            });

            it('when the dividend is larger than the divisor', async function () {
                const a = new BN('7000');
                const b = new BN('5678');

                expect(await this.safeMath.methods.mod(a.toString(), b.toString()).call()).to.be.equal(a.mod(b).toString());
            });

            it('when the dividend is a multiple of the divisor', async function () {
                const a = new BN('17034'); // 17034 == 5678 * 3
                const b = new BN('5678');

                expect(await this.safeMath.methods.mod(a.toString(), b.toString()).call()).to.be.equal(a.mod(b).toString());
            });
        });

        it('reverts with a 0 divisor', async function () {
            const a = new BN('5678');
            const b = new BN('0');

            await helpers.assertInvalidOpcode(async () => {
                await this.safeMath.methods.mod(
                    a.toString(), b.toString()
                ).call();
            }, "SafeMath: modulo by zero");

        });
    });

});
