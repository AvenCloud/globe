import React from 'react';
import {
  Title,
  Body,
  Page,
  Section,
  SubSection,
  Bold,
  Link,
} from '../DocViews';

function DocPage() {
  return (
    <Page>
      <Title>About Aven</Title>
      <Body>
        <Bold>Aven Cloud</Bold> is a data-handling framework for web and mobile
        JavaScript applications. It helps keep data up to date across the client
        and server as it changes over time, handles authentication, enforces
        permissions, and computes changes on top of the data.
      </Body>
      <Body>
        <Bold>Aven</Bold> is an emerging framework for building React apps on
        every platform. It includes React Native technologies for the views,
        React Navigation as the cross-platform navigation library, and Aven
        Cloud as the data handling framework.
      </Body>
      <Body>
        This project is authored by{' '}
        <Link url="https://twitter.com/EricVicenti">Eric Vicenti</Link>, and is
        open to community contribution.
      </Body>
      <Section title="Sustainability">
        <Body>
          The goal is to ensure maintainability of Aven apps for a long period
          of time.
        </Body>
      </Section>
      <Section title="Development Philosophies">
        <SubSection title="Iteration">
          <Body>
            We have a philosophy of slow and iterative improvements to our
            existing technologies in order to fix our problems. Rather than
            recklessly discarding inferior abstractions, we can build
            long-lasting systems by providing graceful upgrade paths to new
            technologies.
          </Body>
          <Body>
            <Bold>Low coupling, high cohension.</Bold> The Aven framework
            intends to be a set of independent, loosly coupled technologies.
            This allows people to gradually opt in to the framework as it
            matures.
          </Body>
        </SubSection>
        <SubSection title="Deployability">
          <Body>
            We aim to make our technology immenently useful in production. We
            cut corners when necessary to get products out the door.
          </Body>
          <Body>
            To mitigate against shortcomings in our abstractions, we install
            escape hatches that give us access to underlying APIs, which can be
            used when coming across.
          </Body>
        </SubSection>
        <SubSection title="Universality">
          <Body>
            When possible, we share technologies across different environments
            to achieve the same thing. Where possible, we only use one
            programming language. One view framework. One navigation system.
          </Body>
          <Body>
            <Bold>Aim to minimize conceptual overlaps.</Bold> By focusing on a
            small set of tools, we can make our skills more portable on
            different environments. Where possible, we avoid tools that lock us
            down to a single environment.
          </Body>
        </SubSection>
      </Section>
    </Page>
  );
}

DocPage.navigationOptions = {
  title: 'About Aven',
};
DocPage.path = 'about';

export default DocPage;
