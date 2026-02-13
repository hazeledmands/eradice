import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Roller from '../Roller/Roller';

describe('Roller UI Test', () => {
  it('should roll dice multiple times and display results', async () => {
    const user = userEvent.setup();
    const { container } = render(<Roller />);

    // Find the input field
    const input = screen.getByLabelText(/what would you like to roll/i);
    expect(input).toBeInTheDocument();

    // Roll dice a few times
    const rollInputs = ['3d+2', '2d', '4d+1'];

    for (const diceNotation of rollInputs) {
      // Type the dice notation
      await user.clear(input);
      await user.type(input, diceNotation);

      // Find and click the roll button
      const rollButton = screen.getByRole('button', { name: /roll/i });
      expect(rollButton).toBeInTheDocument();
      await user.click(rollButton);

      // Wait for the roll to appear in the ledger
      await waitFor(
        () => {
          const rollTexts = screen.getAllByText(diceNotation);
          expect(rollTexts.length).toBeGreaterThan(0);
        },
        { timeout: 1000 }
      );

      // Wait for dice to finish rolling and display results
      // Dice animations take 500-1500ms, wait up to 3 seconds
      await waitFor(
        () => {
          // Check that dice numbers are displayed (1-6)
          const dieElements = container.querySelectorAll('[class*="DieView"]');
          const diceWithNumbers = Array.from(dieElements).filter((die) => {
            const text = die.textContent?.trim();
            return text && /^[1-6]$/.test(text);
          });
          expect(diceWithNumbers.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );
    }

    // Verify all rolls are displayed in the ledger
    rollInputs.forEach((diceNotation) => {
      const rollTexts = screen.getAllByText(diceNotation);
      expect(rollTexts.length).toBeGreaterThan(0);
    });

    // Verify that dice results are shown for all rolls
    const allDieElements = container.querySelectorAll('[class*="DieView"]');
    const allVisibleDice = Array.from(allDieElements).filter((die) => {
      const text = die.textContent?.trim();
      return text && /^[1-6]$/.test(text);
    });

    expect(allVisibleDice.length).toBeGreaterThan(0);
  });

  it('should display dice results after rolling', async () => {
    const user = userEvent.setup();
    const { container } = render(<Roller />);

    const input = screen.getByLabelText(/what would you like to roll/i);
    await user.type(input, '3d+2');

    const rollButton = screen.getByRole('button', { name: /roll/i });
    await user.click(rollButton);

    // Wait for roll to appear
    await waitFor(
      () => {
        const rollTexts = screen.getAllByText('3d+2');
        expect(rollTexts.length).toBeGreaterThan(0);
      },
      { timeout: 1000 }
    );

    // Wait for dice to display numbers (animations take 500-1500ms)
    await waitFor(
      () => {
        const dieElements = container.querySelectorAll('[class*="DieView"]');
        const diceWithNumbers = Array.from(dieElements).filter((die) => {
          const text = die.textContent?.trim();
          return text && /^[1-6]$/.test(text);
        });
        // Should have at least 3 dice (one for each d in 3d)
        expect(diceWithNumbers.length).toBeGreaterThanOrEqual(3);
      },
      { timeout: 3000 }
    );
  });
});

