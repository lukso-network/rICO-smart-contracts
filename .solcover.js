module.exports = {
    port: 6545,
    testrpcOptions: '-p 6545 -a 11 -e 100000 -d -n -i 15 -m "exchange neither monster ethics bless cancel ghost excite business record warfare invite"',
    testCommand: 'node test/run_solc_tests.js all coverage',
    skipFiles: ['zeppelin', 'mocks']
};