# Contributing to Kasbah Guard

Thank you for your interest in contributing to Kasbah Guard.

## How to Contribute

### Reporting Issues

- Use GitHub Issues to report bugs or request features
- Include your OS version, Kasbah Guard version, and steps to reproduce
- Do not include any PII or sensitive data in issue reports

### Security Vulnerabilities

If you discover a security vulnerability, **do not open a public issue**.
Email security@bekasbah.com with details. We will respond within 48 hours.

### Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run the test suite (`python3 kasbah_full_test.py`)
5. Ensure all 85+ tests pass
6. Submit a pull request

### Code Standards

- Rust code: follow `rustfmt` defaults
- Python tests: follow PEP 8
- All detection logic must include test coverage
- No external network calls in the detection engine (local-first principle)

### What We Accept

- New PII/PHI/PCI detection patterns with test vectors
- False positive reduction improvements
- Performance optimizations
- Documentation improvements
- Browser extension enhancements

### What We Don't Accept

- Changes that add cloud dependencies to the detection engine
- Features that transmit user data externally
- Closed-source dependencies

## Code of Conduct

All contributors must follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under
the same terms as the project (see [LICENSE](LICENSE)).
