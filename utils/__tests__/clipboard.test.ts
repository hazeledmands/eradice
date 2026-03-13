import { copyToClipboard } from '../clipboard';

describe('copyToClipboard', () => {
  describe('with navigator.clipboard available', () => {
    let writeTextMock: jest.Mock;

    beforeEach(() => {
      writeTextMock = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        configurable: true,
        writable: true,
      });
    });

    it('calls navigator.clipboard.writeText with the provided text', async () => {
      await copyToClipboard('hello world');
      expect(writeTextMock).toHaveBeenCalledWith('hello world');
    });

    it('resolves successfully when writeText succeeds', async () => {
      await expect(copyToClipboard('test')).resolves.toBeUndefined();
    });

    it('rejects when writeText throws', async () => {
      const error = new Error('clipboard denied');
      writeTextMock.mockRejectedValueOnce(error);
      await expect(copyToClipboard('test')).rejects.toThrow('clipboard denied');
    });
  });

  describe('fallback for older browsers', () => {
    beforeEach(() => {
      // Remove modern clipboard API
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      // jsdom doesn't implement execCommand; define a stub so spyOn can wrap it
      if (!document.execCommand) {
        Object.defineProperty(document, 'execCommand', {
          value: jest.fn().mockReturnValue(true),
          configurable: true,
          writable: true,
        });
      }
    });

    it('creates a textarea, selects it, and calls execCommand', async () => {
      const execCommandMock = jest.spyOn(document, 'execCommand').mockReturnValue(true);
      const appendChildSpy = jest.spyOn(document.body, 'appendChild');
      const removeChildSpy = jest.spyOn(document.body, 'removeChild');

      await copyToClipboard('fallback text');

      expect(execCommandMock).toHaveBeenCalledWith('copy');
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();

      execCommandMock.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('rejects when execCommand throws', async () => {
      const execCommandMock = jest
        .spyOn(document, 'execCommand')
        .mockImplementation(() => { throw new Error('execCommand failed'); });

      await expect(copyToClipboard('test')).rejects.toThrow('execCommand failed');

      execCommandMock.mockRestore();
    });
  });
});
