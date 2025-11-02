import React from 'react';
import * as Random from 'random-js';
import styles from '../styles/App.module.css';

class Ledger extends React.Component {
  constructor(props) {
    super(props);
    this.state = { completedRolls: {} };
    this.onRollComplete = this.onRollComplete.bind(this);
    this.handleCopy = this.handleCopy.bind(this);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.rolls !== this.props.rolls) {
      // Initialize tracking for new rolls
      const newRolls = this.props.rolls.filter(roll => 
        !this.state.completedRolls[roll.id]
      );
      newRolls.forEach(roll => {
        this.setState(prevState => ({
          completedRolls: {
            ...prevState.completedRolls,
            [roll.id]: false
          }
        }));
      });
    }
  }

  onRollComplete(rollId, completedDice) {
    this.setState(prevState => ({
      completedRolls: {
        ...prevState.completedRolls,
        [rollId]: true
      }
    }));
    
    // Update the parent's roll with completed dice
    if (this.props.onRollComplete) {
      this.props.onRollComplete(rollId, completedDice);
    }
  }

  calculateResult(roll) {
    if (!roll.dice || roll.dice.length === 0) return null;
    
    const isComplete = roll.dice.every(die => !die.isRolling);
    if (!isComplete) return null;

    const totalFaces = roll.dice
      .filter(die => !die.isRolling && !die.isCancelled)
      .reduce((acc, die) => die.number + acc, 0);
    
    const modifier = roll.modifier || 0;
    return totalFaces + modifier;
  }

  handleCopy(roll) {
    const result = this.calculateResult(roll);
    if (result === null) return;

    // Get all completed dice (for display) and active dice (for calculation)
    const allCompletedDice = roll.dice.filter(die => !die.isRolling);
    const activeDice = allCompletedDice
      .filter(die => !die.isCancelled)
      .map(die => die.number);
    
    const modifier = roll.modifier || 0;
    const totalFaces = activeDice.reduce((acc, val) => acc + val, 0);
    
    // Build the copy text with individual dice results
    let copyText = `${roll.text} =`;
    
    // Add individual dice values - show all dice in square brackets, mark cancelled ones
    if (allCompletedDice.length > 0) {
      const diceParts = allCompletedDice.map(die => {
        if (die.isCancelled) {
          return `[${die.number}-canceled]`;
        }
        return `[${die.number}]`;
      });
      copyText += ` ${diceParts.join(' ')}`;
    }
    
    // Add modifier if present
    if (modifier > 0) {
      copyText += ` + ${modifier}`;
    }
    
    // Add final result
    copyText += ` = ${result}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(copyText).catch(err => {
        console.error('Failed to copy text:', err);
      });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = copyText;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textArea);
    }
  }

  render() {
    return <div className={styles.Ledger}>
      <ul>
        {this.props.rolls.map(roll => {
          const result = this.calculateResult(roll);
          const isComplete = roll.dice && roll.dice.every(die => !die.isRolling);
          
          return (
            <li key={roll.id}>
              <div className={styles.rollHeader}>
                <span className={styles.text}>{roll.text}</span>
                {isComplete && result !== null && (
                  <div className={styles.buttonGroup}>
                    <button 
                      className={styles.rerollButton}
                      onClick={() => this.props.onReroll && this.props.onReroll(roll.id)}
                      title="Reroll dice"
                    >
                      Reroll
                    </button>
                    <button 
                      className={styles.copyButton}
                      onClick={() => this.handleCopy(roll)}
                      title="Copy to clipboard"
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
              <DiceTray 
                dice={roll.dice} 
                modifier={roll.modifier}
                rollId={roll.id}
                onRollComplete={this.onRollComplete}
              />
            </li>
          );
        })}
      </ul>
    </div>
  }
}

class DiceTray extends React.Component {
  constructor(props) {
    super(props);
    this.state = {dice: props.dice, hasReportedComplete: false};
  }

  componentDidUpdate(oldProps, oldState) {
    if (oldProps.dice !== this.props.dice) {
      this.setState({dice: this.props.dice, hasReportedComplete: false});
    }
    
    // Report completion when all dice finish rolling
    const isComplete = this.state.dice.every(die => !die.isRolling);
    if (isComplete && !this.state.hasReportedComplete && this.props.onRollComplete) {
      this.setState({ hasReportedComplete: true });
      this.props.onRollComplete(this.props.rollId, this.state.dice);
    }
  }

  render() {
    const isComplete = this.state.dice.every(die => !die.isRolling);
    const totalFaces = this.state.dice
      .filter(die => !die.isRolling && !die.isCancelled)
      .reduce((acc, die) => die.number + acc, 0);

    const mathText = [];
    if (isComplete && this.state.dice.length > 1) mathText.push(`= ${totalFaces}`);
    if (this.props.modifier > 0) mathText.push(`+ ${this.props.modifier}`);
    if (isComplete && this.props.modifier > 0) mathText.push(`= ${this.props.modifier + totalFaces}`)

    return <div className={styles.DiceTray}>
      {this.state.dice.map(die => <Die key={die.id} {...die} onStopped={(number) => this.onDieStopped(die, number)} />)}
      <div className={styles.Math}>{mathText.join(' ')}</div>
    </div>
  }

  onDieStopped(stoppedDie, number) {
    const didExplodeSucceed = stoppedDie.canExplodeSucceed && number === 6; 
    const didExplodeFail = stoppedDie.canExplodeFail && number === 1;

    let dice = this.state.dice.map(d => {
      if (d !== stoppedDie) return d;
      return {...d, number, isRolling: false, isCancelled: didExplodeFail};
    });

    if (didExplodeSucceed) {
      const newDie = {
        id: this.state.dice.length,
        isRolling: true,
        isExploding: true,
        canExplodeSucceed: true,
        canExplodeFail: false,
        stopAfter: generateRollDuration()
      };
      dice = [...dice, newDie];
    }

    const isComplete = dice.every(d => !d.isRolling);
    if (isComplete) {
      const failures = dice.filter(d => d.canExplodeFail && d.number === 1).length;

      dice
        .filter(d => !d.isExploding)
        .sort((a, b) => b.number - a.number)
        .filter((d, i) => i < failures)
        .forEach(cancelDie => {
          dice = dice.map(d => {
            if (d !== cancelDie) return d;
            return {...d, isCancelled: true};
          })
        });
    }

    this.setState({dice});
  }
}

class Die extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      number: (props.number == null) ? generateRandomFace() : props.number,
      isRolling: props.isRolling,
    };
  }

  componentDidMount() {
    if (this.state.isRolling) this.roll();
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.timer);
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.isRolling && !this.state.isRolling && this.props.onStopped != null) {
      this.props.onStopped(this.state.number)
    }
  }

  roll() {
    this.timer = requestAnimationFrame((ts) => {
      if (this.startTs == null) this.startTs = ts;
      const elapsedSinceStart = ts - this.startTs;
      if (elapsedSinceStart > this.props.stopAfter) {
        this.setState({isRolling: false});
        return;
      }

      if (this.lastUpdateTs == null) this.lastUpdateTs = 0;
      const elapsedBetweenUpdates = ts - this.lastUpdateTs;
      if (elapsedBetweenUpdates > 50) {
        this.lastUpdateTs = ts;
        let number;
        while (number !== this.state.number) number = generateRandomFace();
        this.setState({number: generateRandomFace()})
      }
      this.roll();
    });
  }

  render() {
    let className = styles.DieView;
    if (this.props.isExploding) className += ` ${styles.exploding}`;
    if (this.props.isCancelled) className += ` ${styles.cancelled}`;
    return <div className={className}>
      {this.state.number}
    </div>
  }
}

class Roller extends React.Component {
  constructor(props) {
    super(props);
    this.state = {rolls: [], text: '', dice: [], isReleased: false};
    this.inputRef = React.createRef();
    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.saveRollsToSessionStorage = this.saveRollsToSessionStorage.bind(this);
    this.loadRollsFromSessionStorage = this.loadRollsFromSessionStorage.bind(this);
  }

  componentDidMount() {
    this.loadRollsFromSessionStorage();
    // Auto-focus the input when the page loads
    if (this.inputRef.current) {
      this.inputRef.current.focus();
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.rolls !== this.state.rolls) {
      this.saveRollsToSessionStorage();
    }
  }

  loadRollsFromSessionStorage() {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const savedRolls = sessionStorage.getItem('diceRolls');
        if (savedRolls) {
          const parsedRolls = JSON.parse(savedRolls);
          // Only load rolls with completed dice (no rolling dice)
          const completedRolls = parsedRolls.filter(roll => 
            roll.dice && roll.dice.every(die => !die.isRolling)
          );
          if (completedRolls.length > 0) {
            this.setState({ rolls: completedRolls });
          }
        }
      }
    } catch (error) {
      console.error('Error loading rolls from sessionStorage:', error);
    }
  }

  saveRollsToSessionStorage() {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        // Only save completed rolls (no dice still rolling)
        const completedRolls = this.state.rolls.filter(roll =>
          roll.dice && roll.dice.every(die => !die.isRolling)
        );
        sessionStorage.setItem('diceRolls', JSON.stringify(completedRolls));
      }
    } catch (error) {
      console.error('Error saving rolls to sessionStorage:', error);
    }
  }

  render() {
    return <div className={styles.Roller}>
      <form onSubmit={this.handleSubmit}>
        <label htmlFor='dice-selector'>What would you like to roll?</label>
        <div className={styles.inputRow}>
          <div className={styles.terminalInput}>
            <span className={styles.prompt}>$</span>
            <input 
              id='dice-selector' 
              ref={this.inputRef}
              onChange={this.handleChange} 
              value={this.state.text}
              placeholder=" 3d+2"
              className={styles.terminalInputField}
            />
          </div>
          <button type="submit">Roll!</button>
        </div>
      </form>

      {this.state.text && <DiceTray dice={this.state.dice} />}

      <Ledger 
        rolls={this.state.rolls} 
        onRollComplete={this.handleRollComplete}
        onReroll={this.handleReroll}
      />
    </div>
  }

  handleChange(e) {
    const text = e.target.value;
    const parser = /(?<dice>\d+)\s*d\s*(\+\s*(?<modifier>\d+))?/i;
    const result = parser.exec(text);

    if (result != null) {
      const diceCount = parseInt(result.groups.dice);
      const modifier = (result.groups.modifier == null) ? 0 : parseInt(result.groups.modifier);

      const dice = [];
      for (let i = 0; i < diceCount; ++i) {
        const isExploding = i === diceCount - 1;
        dice.push({
          id: i,
          isRolling: true,
          isExploding,
          canExplodeSucceed: isExploding,
          canExplodeFail: isExploding,
        });
      }

      this.setState({dice, modifier})
    }

    this.setState({text});
  }

  handleSubmit(e) {
    e.preventDefault();
    if (this.state.text.length === 0) return;

    const newRoll = {
      id: Date.now(),
      text: this.state.text,
      dice: this.state.dice.map(die => ({
        ...die,
        stopAfter: generateRollDuration(),
      })),
      modifier: this.state.modifier,
    }

    this.setState(state => ({
      text: '',
      dice: [],
      rolls: [newRoll, ...state.rolls],
    }));
  }

  handleRollComplete = (rollId, completedDice) => {
    this.setState(state => ({
      rolls: state.rolls.map(roll => 
        roll.id === rollId 
          ? { ...roll, dice: completedDice }
          : roll
      )
    }));
  }

  handleReroll = (rollId) => {
    const roll = this.state.rolls.find(r => r.id === rollId);
    if (!roll) return;

    // Parse the roll text to get dice count and modifier
    const parser = /(?<dice>\d+)\s*d\s*(\+\s*(?<modifier>\d+))?/i;
    const result = parser.exec(roll.text);
    
    if (!result) return;

    const diceCount = parseInt(result.groups.dice);
    const modifier = (result.groups.modifier == null) ? 0 : parseInt(result.groups.modifier);

    // Create new dice for reroll
    const newDice = [];
    for (let i = 0; i < diceCount; ++i) {
      const isExploding = i === diceCount - 1;
      newDice.push({
        id: i,
        isRolling: true,
        isExploding,
        canExplodeSucceed: isExploding,
        canExplodeFail: isExploding,
        stopAfter: generateRollDuration(),
      });
    }

    // Update the roll with new dice
    this.setState(state => ({
      rolls: state.rolls.map(r => 
        r.id === rollId 
          ? { ...r, dice: newDice }
          : r
      )
    }));
  }
}

function generateRollDuration() {
  return 500 + Math.random() * 1000;
}

function generateRandomFace(sides = 6) {
  return Random.die(sides)(Random.browserCrypto);
}

export default Roller;

