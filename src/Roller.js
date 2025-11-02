import React from 'react';
import * as Random from 'random-js';

class Ledger extends React.Component {
  render() {
    return <div className="Ledger">
      <ul>
        {this.props.rolls.map(roll => (
          <li key={roll.id}>
            <span className="text">{roll.text}</span>
            <DiceTray dice={roll.dice} modifier={roll.modifier} />
          </li>
        ))}
      </ul>
    </div>
  }
}

class DiceTray extends React.Component {
  constructor(props) {
    super(props);
    this.state = {dice: props.dice};
  }

  componentDidUpdate(oldProps, oldState) {
    if (oldProps.dice !== this.props.dice) this.setState({dice: this.props.dice});
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

    return <div className="DiceTray">
      {this.state.dice.map(die => <Die key={die.id} {...die} onStopped={(number) => this.onDieStopped(die, number)} />)}
      <div className="Math">{mathText.join(' ')}</div>
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
    let className = "DieView";
    if (this.props.isExploding) className += ' exploding';
    if (this.props.isCancelled) className += ' cancelled';
    return <div className={className}>
      {this.state.number}
    </div>
  }
}

class Roller extends React.Component {
  constructor(props) {
    super(props);
    this.state = {rolls: [], text: '', dice: [], isReleased: false};
    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  render() {
    return <div className="Roller">
      <form onSubmit={this.handleSubmit}>
        <label htmlFor='dice-selector'>What would you like to roll?</label>
        <input 
          id='dice-selector' 
          onChange={this.handleChange} 
          value={this.state.text}
          placeholder="e.g., 3d+2"
        />
        <button type="submit">Roll!</button>
      </form>

      <DiceTray dice={this.state.dice} />

      <Ledger rolls={this.state.rolls} />
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
}

function generateRollDuration() {
  return 500 + Math.random() * 1000;
}

function generateRandomFace(sides = 6) {
  return Random.die(sides)(Random.browserCrypto);
}

export default Roller;
