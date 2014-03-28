describe('Components: Loader registry', function() {
    var testAsyncDelay = 20,
        testComponentName = 'test-component',
        testComponentConfig = {},
        testComponentDefinition = { template: {} },
        loaderThatDoesNotReturnAnything = {
            getConfig: function(name, callback) {
                expect(name).toBe(testComponentName);
                setTimeout(function() { callback(null) }, testAsyncDelay);
            },
            loadComponent: function(name, config, callback) {
                expect(name).toBe(testComponentName);
                expect(config).toBe(testComponentConfig);
                setTimeout(function() { callback(null) }, testAsyncDelay);
            }
        },
        loaderThatHasNoHandlers = {},
        loaderThatReturnsConfig = {
            getConfig: function(name, callback) {
                expect(name).toBe(testComponentName);
                setTimeout(function() { callback(testComponentConfig) }, testAsyncDelay);
            }
        },
        loaderThatReturnsDefinition = {
            loadComponent: function(name, config, callback) {
                expect(name).toBe(testComponentName);
                expect(config).toBe(testComponentConfig);
                setTimeout(function() { callback(testComponentDefinition) }, testAsyncDelay);
            }
        },
        loaderThatShouldNeverBeCalled = {
            getConfig: function() { throw new Error('Should not be called'); },
            loadComponent: function() { throw new Error('Should not be called'); }
        },
        loaderThatCompletesSynchronously = {
            getConfig: function(name, callback) { callback(testComponentConfig); },
            loadComponent: function(name, config, callback) {
                expect(config).toBe(testComponentConfig);
                callback(testComponentDefinition);
            }
        },
        testLoaderChain = function(spec, chain, options) {
            spec.restoreAfter(ko.components, 'loaders');

            // Set up a chain of loaders, then query it
            ko.components.loaders = chain;

            var loadedDefinition = "Not yet loaded";
            ko.components.get(testComponentName, function(definition) {
                loadedDefinition = definition;
            });

            var onLoaded = function() {
                if ('expectedDefinition' in options) {
                    expect(loadedDefinition).toBe(options.expectedDefinition);
                }
                if ('done' in options) {
                    options.done(loadedDefinition);
                }
            };

            // Wait for and verify result
            if (loadedDefinition !== "Not yet loaded") {
                // Completed synchronously
                onLoaded();
            } else {
                // Will complete asynchronously
                waitsFor(function() { return loadedDefinition !== "Not yet loaded"; }, 300);
                runs(onLoaded);
            }
        };

    afterEach(function() {
        ko.components.unregister(testComponentName);
    });

    it('Exposes the list of loaders as an array', function() {
        expect(ko.components.loaders instanceof Array).toBe(true);
    });

    it('Obtains component config and component definition objects by invoking each loader in turn, asynchronously, until one supplies a value', function() {
        var loaders = [
            loaderThatDoesNotReturnAnything,
            loaderThatHasNoHandlers,
            loaderThatReturnsDefinition,
            loaderThatDoesNotReturnAnything,
            loaderThatReturnsConfig,
            loaderThatShouldNeverBeCalled
        ];

        testLoaderChain(this, loaders, { expectedDefinition: testComponentDefinition });
    });

    it('Supplies null if no registered loader returns a config object', function() {
        var loaders = [
            loaderThatDoesNotReturnAnything,
            loaderThatHasNoHandlers,
            loaderThatReturnsDefinition,
            loaderThatDoesNotReturnAnything
        ];

        testLoaderChain(this, loaders, { expectedDefinition: null });
    });

    it('Supplies null if no registered loader returns a component for a given config object', function() {
        var loaders = [
            loaderThatDoesNotReturnAnything,
            loaderThatHasNoHandlers,
            loaderThatReturnsConfig,
            loaderThatDoesNotReturnAnything
        ];

        testLoaderChain(this, loaders, { expectedDefinition: null });
    });

    it('Aborts if a getConfig call returns a value other than undefined', function() {
        // This is just to leave open the option to support synchronous return values in the future.
        // We would detect that a getConfig call wants to return synchronously based on getting a
        // non-undefined return value, and in that case would not wait for the callback.

        var loaders = [
            loaderThatReturnsDefinition,
            loaderThatDoesNotReturnAnything,
            {
                getConfig: function(name, callback) {
                    setTimeout(function() { callback(testComponentDefinition); }, 50);
                    return testComponentDefinition; // This is what's not allowed
                },

                // Unfortunately there's no way to catch the async exception, and we don't
                // want to clutter up the console during tests, so suppress this
                suppressLoaderExceptions: true
            },
            loaderThatReturnsConfig
        ];

        testLoaderChain(this, loaders, { expectedDefinition: null });
    });

    it('Aborts if a loadComponent call returns a value other than undefined', function() {
        // This is just to leave open the option to support synchronous return values in the future.
        // We would detect that a loadComponent call wants to return synchronously based on getting a
        // non-undefined return value, and in that case would not wait for the callback.

        var loaders = [
            loaderThatReturnsConfig,
            loaderThatDoesNotReturnAnything,
            {
                loadComponent: function(name, config, callback) {
                    setTimeout(function() { callback(testComponentDefinition); }, 50);
                    return testComponentDefinition; // This is what's not allowed
                },

                // Unfortunately there's no way to catch the async exception, and we don't
                // want to clutter up the console during tests, so suppress this
                suppressLoaderExceptions: true
            },
            loaderThatReturnsDefinition
        ];

        testLoaderChain(this, loaders, { expectedDefinition: null });
    });

    it('Ensures that the loading process completes asynchronously, even if the loader completed synchronously', function() {
        // This behavior is for consistency. Developers calling ko.components.get shouldn't have to
        // be concerned about whether the callback fires before or after their next line of code.

        var wasAsync = false;

        testLoaderChain(this, [loaderThatCompletesSynchronously], {
            expectedDefinition: testComponentDefinition,
            done: function() {
                expect(wasAsync).toBe(true);
            }
        });

        wasAsync = true;
    });

    it('By default, contains only the default loader', function() {
        expect(ko.components.loaders.length).toBe(1);
        expect(ko.components.loaders[0]).toBe(ko.components.defaultLoader);
    });

    it('Caches and reuses loaded component definitions', function() {
        // Ensure we leave clean state after the test
        this.after(function() {
            ko.components.unregister('some-component');
            ko.components.unregister('other-component');
        });

        ko.components.register('some-component', {
            viewModel: function() { this.isTheTestComponent = true; }
        });
        ko.components.register('other-component', {
            viewModel: function() { this.isTheOtherComponent = true; }
        });

        // Fetch the component definition, and see it's the right thing
        var definition1;
        getComponentDefinition('some-component', function(definition) {
            definition1 = definition;
            expect(definition1.createViewModel().isTheTestComponent).toBe(true);
        });

        // Fetch it again, and see the definition was reused
        getComponentDefinition('some-component', function(definition2) {
            expect(definition2).toBe(definition1);
        });

        // See that requests for other component names don't reuse the same cache entry
        getComponentDefinition('other-component', function(otherDefinition) {
            expect(otherDefinition).not.toBe(definition1);
            expect(otherDefinition.createViewModel().isTheOtherComponent).toBe(true);
        });

        // See we can choose to force a refresh by clearing a cache entry before fetching a definition.
        // This facility probably won't be used by most applications, but it is helpful for tests.
        runs(function() { ko.components.clearCachedDefinition('some-component'); });
        getComponentDefinition('some-component', function(definition3) {
            expect(definition3).not.toBe(definition1);
            expect(definition3.createViewModel().isTheTestComponent).toBe(true);
        });

        // See that unregistering a component implicitly clears the cache entry too
        runs(function() { ko.components.unregister('some-component'); });
        getComponentDefinition('some-component', function(definition4) {
            expect(definition4).toBe(null);
        });
    });

    it('Only commences a single loading process, even if multiple requests arrive before loading has completed', function() {
        // Set up a mock AMD environment that logs calls
        var someModuleTemplate = document.createDocumentFragment(),
            someComponentModule = { template: someModuleTemplate },
            requireCallLog = [];
        this.restoreAfter(window, 'require');
        window.require = function(modules, callback) {
            requireCallLog.push(modules.slice(0));
            setTimeout(function() { callback(someComponentModule); }, 80);
        };

        ko.components.register(testComponentName, { require: 'path/testcomponent' });

        // Begin loading the module; see it synchronously made a request to the module loader
        var definition1 = undefined;
        ko.components.get(testComponentName, function(loadedDefinition) {
            definition1 = loadedDefinition;
        });
        expect(requireCallLog).toEqual([['path/testcomponent']]);

        // Even a little while later, the module hasn't yet loaded
        var definition2 = undefined;
        waits(20);
        runs(function() {
            expect(definition1).toBe(undefined);

            // ... but let's make a second request for the same module
            ko.components.get(testComponentName, function(loadedDefinition) {
                definition2 = loadedDefinition;
            });

            // This time there was no further request to the module loader
            expect(requireCallLog.length).toBe(1);
        });

        // And when the loading eventually completes, both requests are satisfied with the same definition
        waitsFor(function() { return definition1 }, 300);
        runs(function() {
            expect(definition1.template).toBe(someModuleTemplate);
            expect(definition2).toBe(definition1);
        });

        // Subsequent requests also don't involve calls to the module loader
        getComponentDefinition(testComponentName, function(definition3) {
            expect(definition3).toBe(definition1);
            expect(requireCallLog.length).toBe(1);
        });
    });

    function getComponentDefinition(componentName, assertionCallback) {
        var loadedDefinition,
            hasCompleted = false;
        runs(function() {
            ko.components.get(componentName, function(definition) {
                loadedDefinition = definition;
                hasCompleted = true;
            });
            expect(hasCompleted).toBe(false); // Should always complete asynchronously
        });
        waitsFor(function() { return hasCompleted; });
        runs(function() { assertionCallback(loadedDefinition); });
    }
});
