import { Logger } from '@nestjs/common';
import {
  DevelopmentPasswordResetDelivery,
  passwordResetDeliveryFor,
  UnconfiguredPasswordResetDelivery,
} from './password-reset-delivery';

describe('password reset delivery', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('development prints the code to the console', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const delivery = new DevelopmentPasswordResetDelivery('development');

    await delivery.deliver('ana@exemplo.com', '042917');

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('042917'));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('DEVELOPMENT ONLY'),
    );
  });

  it('development refuses to be built in production', () => {
    expect(() => new DevelopmentPasswordResetDelivery('production')).toThrow(
      'must not run in production',
    );
  });

  it('chooses the development channel outside production and tests', () => {
    expect(passwordResetDeliveryFor(undefined)).toBeInstanceOf(
      DevelopmentPasswordResetDelivery,
    );
    expect(passwordResetDeliveryFor('development')).toBeInstanceOf(
      DevelopmentPasswordResetDelivery,
    );
  });

  it.each(['production', 'test'])(
    'uses the unconfigured channel when NODE_ENV is %s',
    (nodeEnv) => {
      expect(passwordResetDeliveryFor(nodeEnv)).toBeInstanceOf(
        UnconfiguredPasswordResetDelivery,
      );
    },
  );

  it('the unconfigured channel reports the gap and never writes the code to a log', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const delivery = new UnconfiguredPasswordResetDelivery();

    await expect(delivery.deliver('ana@exemplo.com', '042917')).rejects.toThrow(
      'no password reset delivery channel is configured',
    );

    const logged = [error, warn, log]
      .flatMap((spy) => spy.mock.calls.flat())
      .join(' ');
    expect(logged).not.toContain('042917');
  });
});
